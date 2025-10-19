import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
import random
import uuid

# Conectar ao MongoDB
client = AsyncIOMotorClient("mongodb://localhost:27017")
db = client["cliniflow_db"]

async def populate_database():
    print("🚀 Iniciando população do banco de dados...")
    
    # Limpar dados existentes (exceto usuários)
    print("🧹 Limpando dados antigos...")
    collections_to_clear = [
        "professionals", "services", "rooms", "patients", 
        "appointments", "leads", "followups", "medical_records"
    ]
    for coll in collections_to_clear:
        await db[coll].delete_many({})
    
    # 1. Profissionais
    print("👨‍⚕️ Criando profissionais...")
    professionals = [
        {"id": str(uuid.uuid4()), "name": "Dr. Carlos Mendes", "specialty": "Cardiologia", "email": "carlos@cliniflow.com", "phone": "(11) 98765-1111", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Dra. Ana Paula Silva", "specialty": "Dermatologia", "email": "ana@cliniflow.com", "phone": "(11) 98765-2222", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Dr. Roberto Santos", "specialty": "Ortopedia", "email": "roberto@cliniflow.com", "phone": "(11) 98765-3333", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Dra. Patricia Lima", "specialty": "Pediatria", "email": "patricia@cliniflow.com", "phone": "(11) 98765-4444", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Dr. Fernando Costa", "specialty": "Neurologia", "email": "fernando@cliniflow.com", "phone": "(11) 98765-5555", "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.professionals.insert_many(professionals)
    print(f"✅ {len(professionals)} profissionais criados")
    
    # 2. Serviços
    print("💉 Criando serviços...")
    services = [
        {"id": str(uuid.uuid4()), "name": "Consulta Cardiológica", "description": "Avaliação completa do sistema cardiovascular", "duration_minutes": 60, "price": 350.00, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Consulta Dermatológica", "description": "Avaliação de pele e anexos", "duration_minutes": 45, "price": 280.00, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Consulta Ortopédica", "description": "Avaliação do sistema musculoesquelético", "duration_minutes": 50, "price": 320.00, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Consulta Pediátrica", "description": "Consulta para crianças e adolescentes", "duration_minutes": 40, "price": 250.00, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Eletrocardiograma", "description": "Exame do coração", "duration_minutes": 30, "price": 180.00, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Raio-X", "description": "Exame de imagem", "duration_minutes": 20, "price": 150.00, "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.services.insert_many(services)
    print(f"✅ {len(services)} serviços criados")
    
    # 3. Salas
    print("🚪 Criando salas...")
    rooms = [
        {"id": str(uuid.uuid4()), "name": "Sala 101", "capacity": 3, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Sala 102", "capacity": 2, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Sala 103", "capacity": 4, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Sala 104", "capacity": 2, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Sala de Exames", "capacity": 1, "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.rooms.insert_many(rooms)
    print(f"✅ {len(rooms)} salas criadas")
    
    # 4. Pacientes
    print("🤒 Criando pacientes...")
    patients = [
        {"id": str(uuid.uuid4()), "name": "Maria Silva", "email": "maria.silva@email.com", "phone": "(11) 91234-5678", "birthdate": "1985-03-15", "address": "Rua das Flores, 123", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "João Santos", "email": "joao.santos@email.com", "phone": "(11) 91234-5679", "birthdate": "1990-07-20", "address": "Av. Paulista, 456", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Ana Costa", "email": "ana.costa@email.com", "phone": "(11) 91234-5680", "birthdate": "1978-11-30", "address": "Rua Augusta, 789", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Pedro Oliveira", "email": "pedro.oliveira@email.com", "phone": "(11) 91234-5681", "birthdate": "1995-05-10", "address": "Rua da Consolação, 321", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Juliana Ferreira", "email": "juliana.f@email.com", "phone": "(11) 91234-5682", "birthdate": "1988-09-25", "address": "Rua Oscar Freire, 654", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Carlos Souza", "email": "carlos.s@email.com", "phone": "(11) 91234-5683", "birthdate": "1982-01-18", "address": "Av. Faria Lima, 987", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Fernanda Lima", "email": "fernanda.l@email.com", "phone": "(11) 91234-5684", "birthdate": "1992-12-05", "address": "Rua Haddock Lobo, 147", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Ricardo Alves", "email": "ricardo.a@email.com", "phone": "(11) 91234-5685", "birthdate": "1975-04-22", "address": "Rua dos Pinheiros, 258", "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.patients.insert_many(patients)
    print(f"✅ {len(patients)} pacientes criados")
    
    # 5. Agendamentos
    print("📅 Criando agendamentos...")
    appointments = []
    today = datetime.now(timezone.utc).date()
    statuses = ["scheduled", "confirmed", "completed"]
    
    for i in range(15):
        day_offset = random.randint(-5, 10)
        appointment_date = (today + timedelta(days=day_offset)).isoformat()
        hour = random.randint(8, 17)
        minute = random.choice([0, 30])
        appointment_time = f"{hour:02d}:{minute:02d}"
        
        appointments.append({
            "id": str(uuid.uuid4()),
            "patient_id": random.choice(patients)["id"],
            "professional_id": random.choice(professionals)["id"],
            "service_id": random.choice(services)["id"],
            "room_id": random.choice(rooms)["id"],
            "appointment_date": appointment_date,
            "appointment_time": appointment_time,
            "status": random.choice(statuses) if day_offset <= 0 else "scheduled",
            "notes": "Paciente solicitou consulta de rotina",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    await db.appointments.insert_many(appointments)
    print(f"✅ {len(appointments)} agendamentos criados")
    
    # 6. Leads
    print("👥 Criando leads...")
    leads = [
        {"id": str(uuid.uuid4()), "name": "Roberto Mendes", "phone": "(11) 99999-1111", "email": "roberto.m@email.com", "source": "whatsapp", "status": "new", "notes": "Interessado em consulta cardiológica", "assigned_to": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Mariana Costa", "phone": "(11) 99999-2222", "email": "mariana.c@email.com", "source": "instagram", "status": "hot", "notes": "Precisa de consulta urgente", "assigned_to": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Paulo Silva", "phone": "(11) 99999-3333", "email": "paulo.s@email.com", "source": "whatsapp", "status": "contacted", "notes": "Já foi contatado, aguardando resposta", "assigned_to": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Luciana Santos", "phone": "(11) 99999-4444", "email": "luciana.s@email.com", "source": "messenger", "status": "hot", "notes": "Interessada em dermatologia estética", "assigned_to": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "André Oliveira", "phone": "(11) 99999-5555", "email": "andre.o@email.com", "source": "whatsapp", "status": "new", "notes": "Pediu informações sobre preços", "assigned_to": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Beatriz Lima", "phone": "(11) 99999-6666", "email": "beatriz.l@email.com", "source": "instagram", "status": "converted", "notes": "Já agendou consulta", "assigned_to": None, "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.leads.insert_many(leads)
    print(f"✅ {len(leads)} leads criados")
    
    # 7. Follow-ups
    print("📋 Criando follow-ups...")
    followups = []
    for i in range(5):
        followups.append({
            "id": str(uuid.uuid4()),
            "lead_id": random.choice(leads)["id"],
            "assigned_to": "admin_user_id",
            "scheduled_date": (today + timedelta(days=random.randint(1, 7))).isoformat(),
            "notes": f"Entrar em contato para acompanhamento {i+1}",
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    await db.followups.insert_many(followups)
    print(f"✅ {len(followups)} follow-ups criados")
    
    # 8. Prontuários
    print("📄 Criando prontuários...")
    completed_appointments = [apt for apt in appointments if apt["status"] == "completed"]
    medical_records = []
    
    for apt in completed_appointments[:5]:
        medical_records.append({
            "id": str(uuid.uuid4()),
            "patient_id": apt["patient_id"],
            "professional_id": apt["professional_id"],
            "appointment_id": apt["id"],
            "diagnosis": "Paciente apresenta quadro estável, sem alterações significativas",
            "treatment": "Recomendado acompanhamento contínuo e retorno em 30 dias",
            "prescription": None,
            "medical_certificate": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    if medical_records:
        await db.medical_records.insert_many(medical_records)
        print(f"✅ {len(medical_records)} prontuários criados")
    
    print("\n✨ Banco de dados populado com sucesso!")
    print(f"📊 Resumo:")
    print(f"   - {len(professionals)} profissionais")
    print(f"   - {len(services)} serviços")
    print(f"   - {len(rooms)} salas")
    print(f"   - {len(patients)} pacientes")
    print(f"   - {len(appointments)} agendamentos")
    print(f"   - {len(leads)} leads")
    print(f"   - {len(followups)} follow-ups")
    print(f"   - {len(medical_records)} prontuários")
    print("\n🎉 Sistema pronto para ser explorado!")

if __name__ == "__main__":
    asyncio.run(populate_database())
