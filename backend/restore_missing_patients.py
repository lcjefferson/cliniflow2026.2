#!/usr/bin/env python3
"""Restaura pacientes que existem no Atlas (origem) mas faltam no Mongo atual (destino).

SEGURANÇA
  * Por padrão é um ENSAIO (dry-run): só mostra o que seria restaurado, não grava nada.
  * Só INSERE o que não existe no destino (compara por `id`). Nunca altera nem apaga nada.
  * Restaura, para cada paciente encontrado: o cadastro, seus documentos (medical_records),
    orçamentos (budgets) e os arquivos do GridFS referenciados pelos anexos.

USO (no Terminal do container `cliniflow-backend` no Coolify, que já tem MONGO_URL e DB_NAME):

    ATLAS_URL='mongodb+srv://usuario:senha@cluster.mongodb.net' python restore_missing_patients.py
    # confira a lista; se estiver certo:
    ATLAS_URL='...' python restore_missing_patients.py --apply

OPÇÕES
  --scope orphans   (padrão) só pacientes que têm agendamentos apontando para eles
  --scope all       todos os pacientes do Atlas que não existem no destino
  --atlas-db NOME   nome do banco no Atlas (padrão: clinicflow, ou a variável ATLAS_DB)

ATENÇÃO: um paciente excluído de propósito pela equipe (por exemplo, um cadastro duplicado)
também volta se estiver no Atlas. Confira a lista do ensaio antes de usar --apply.
"""
import argparse
import os
import sys

from bson import ObjectId
from pymongo import MongoClient

GRIDFS_ID_FIELDS = (
    "gridfs_id",
    "thumbnail_gridfs_id",
    "thumbnail_webp_gridfs_id",
    "preview_modal_gridfs_id",
    "preview_modal_webp_gridfs_id",
)


def find_orphan_patient_ids(dst):
    """Ids citados por agendamentos que não existem na coleção de pacientes do destino."""
    existing = {d["id"] for d in dst.patients.find({}, {"id": 1, "_id": 0}) if d.get("id")}
    referenced = {pid for pid in dst.appointments.distinct("patient_id") if pid}
    return referenced - existing


def find_missing_ids(src, dst, scope):
    """Ids de pacientes que estão no Atlas e faltam no destino, dentro do escopo escolhido."""
    existing = {d["id"] for d in dst.patients.find({}, {"id": 1, "_id": 0}) if d.get("id")}
    if scope == "orphans":
        wanted = find_orphan_patient_ids(dst)
        found = [
            d["id"]
            for d in src.patients.find({"id": {"$in": sorted(wanted)}}, {"id": 1, "_id": 0})
            if d.get("id") and d["id"] not in existing
        ]
        return wanted, set(found)
    all_src = {d["id"] for d in src.patients.find({}, {"id": 1, "_id": 0}) if d.get("id")}
    missing = all_src - existing
    return missing, set(missing)


def referenced_gridfs_ids(patient):
    ids = []
    for att in patient.get("attachments") or []:
        for field in GRIDFS_ID_FIELDS:
            value = att.get(field)
            if value:
                try:
                    ids.append(ObjectId(str(value)))
                except Exception:
                    pass
    return ids


def copy_gridfs_file(src, dst, oid):
    """Copia um arquivo do GridFS (metadados + pedaços) se ainda não existir no destino."""
    if dst.fs.files.find_one({"_id": oid}, {"_id": 1}):
        return "ja_existia"
    meta = src.fs.files.find_one({"_id": oid})
    if not meta:
        return "ausente_na_origem"
    chunks = list(src.fs.chunks.find({"files_id": oid}))
    for chunk in chunks:
        dst.fs.chunks.insert_one(chunk)
    dst.fs.files.insert_one(meta)
    return "copiado"


def restore(src, dst, ids, apply):
    report = {"pacientes": 0, "documentos": 0, "orcamentos": 0, "arquivos": 0, "arquivos_ausentes": 0}
    for pid in sorted(ids):
        patient = src.patients.find_one({"id": pid})
        if not patient or dst.patients.find_one({"id": pid}, {"_id": 1}):
            continue
        records = [r for r in src.medical_records.find({"patient_id": pid})]
        budgets = [b for b in src.budgets.find({"patient_id": pid})]
        gridfs_ids = referenced_gridfs_ids(patient)
        report["pacientes"] += 1
        report["documentos"] += len(records)
        report["orcamentos"] += len(budgets)
        if not apply:
            continue
        # GridFS primeiro: se algo falhar, o cadastro não aponta para arquivos inexistentes.
        for oid in gridfs_ids:
            result = copy_gridfs_file(src, dst, oid)
            if result == "copiado":
                report["arquivos"] += 1
            elif result == "ausente_na_origem":
                report["arquivos_ausentes"] += 1
        dst.patients.insert_one(patient)
        for record in records:
            if not dst.medical_records.find_one({"id": record.get("id")}, {"_id": 1}):
                dst.medical_records.insert_one(record)
        for budget in budgets:
            if not dst.budgets.find_one({"id": budget.get("id")}, {"_id": 1}):
                dst.budgets.insert_one(budget)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="grava no banco (sem isso é só um ensaio)")
    parser.add_argument("--scope", choices=("orphans", "all"), default="orphans")
    parser.add_argument("--atlas-db", default=os.environ.get("ATLAS_DB", "clinicflow"))
    args = parser.parse_args(argv)

    atlas_url = os.environ.get("ATLAS_URL", "").strip()
    dest_url = os.environ.get("MONGO_URL", "").strip()
    dest_db = os.environ.get("DB_NAME", "clinicflow").strip()
    if not atlas_url or not dest_url:
        print("Defina ATLAS_URL (origem) e MONGO_URL (destino, já existe no container do backend).")
        return 2

    src_client = MongoClient(atlas_url, serverSelectionTimeoutMS=15000)
    dst_client = MongoClient(dest_url, serverSelectionTimeoutMS=15000)
    src = src_client[args.atlas_db]
    dst = dst_client[dest_db]
    src_client.admin.command("ping")
    dst_client.admin.command("ping")
    print(f"Origem (Atlas): {args.atlas_db} | pacientes: {src.patients.count_documents({})}")
    print(f"Destino:        {dest_db} | pacientes: {dst.patients.count_documents({})}")

    wanted, restorable = find_missing_ids(src, dst, args.scope)
    print(f"\nEscopo '{args.scope}': {len(wanted)} paciente(s) procurado(s); {len(restorable)} existem no Atlas e faltam no destino.")
    if args.scope == "orphans":
        print(f"Não encontrados no Atlas (excluídos antes ou nunca existiram lá): {len(wanted - restorable)}")

    if restorable:
        print("\nPacientes que seriam restaurados:")
        for doc in src.patients.find({"id": {"$in": sorted(restorable)}}, {"id": 1, "name": 1, "created_at": 1, "_id": 0}).sort("name", 1):
            print(f"  - {doc.get('name')}  ({doc.get('id')})  criado em {str(doc.get('created_at'))[:10]}")

    report = restore(src, dst, restorable, apply=args.apply)
    if args.apply:
        print(f"\nRESTAURADO: {report}")
    else:
        print(f"\nENSAIO (nada foi gravado). Resumo do que seria restaurado: {report}")
        print("Para gravar, rode de novo com --apply.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
