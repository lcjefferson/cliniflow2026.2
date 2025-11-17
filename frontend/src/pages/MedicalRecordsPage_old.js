import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { FileText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function MedicalRecordsPage() {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [records, setRecords] = useState([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    try {
      const response = await api.get("/patients");
      setPatients(response.data);
    } catch (error) {
      toast.error("Erro ao carregar pacientes");
    }
  };

  const loadRecords = async (patientId) => {
    try {
      const response = await api.get(`/medical-records/patient/${patientId}`);
      setRecords(response.data);
      setSelectedPatient(patientId);
    } catch (error) {
      toast.error("Erro ao carregar prontuários");
    }
  };

  const generateDocument = async (recordId, type) => {
    setGenerating(true);
    try {
      const response = await api.post("/medical-records/generate-document", {
        record_id: recordId,
        document_type: type
      });
      toast.success(`${type === 'prescription' ? 'Receita' : 'Atestado'} gerado com IA!`);
      loadRecords(selectedPatient);
    } catch (error) {
      toast.error("Erro ao gerar documento");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Layout>
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-8" data-testid="medicalrecords-page-title">Prontuários</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de pacientes */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Pacientes</h2>
            <div className="space-y-2">
              {patients.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => loadRecords(patient.id)}
                  className={`w-full text-left p-3 rounded-xl transition-colors ${
                    selectedPatient === patient.id
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className="font-medium">{patient.name}</p>
                  <p className="text-sm opacity-80">{patient.email}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Prontuários */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-lg p-6">
            {!selectedPatient ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p>Selecione um paciente para ver os prontuários</p>
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p>Nenhum prontuário encontrado</p>
              </div>
            ) : (
              <div className="space-y-6">
                <h2 className="text-xl font-bold text-gray-900">Prontuários do Paciente</h2>
                {records.map((record) => (
                  <div key={record.id} className="border border-gray-200 rounded-xl p-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-bold text-gray-900 mb-2">Diagnóstico</h3>
                      <p className="text-gray-700">{record.diagnosis}</p>
                    </div>
                    <div className="mb-4">
                      <h3 className="text-lg font-bold text-gray-900 mb-2">Tratamento</h3>
                      <p className="text-gray-700">{record.treatment}</p>
                    </div>
                    
                    {record.prescription && (
                      <div className="mb-4 p-4 bg-blue-50 rounded-xl">
                        <h3 className="text-lg font-bold text-blue-900 mb-2">Receita (Gerada com IA)</h3>
                        <p className="text-blue-800 whitespace-pre-wrap">{record.prescription}</p>
                      </div>
                    )}
                    
                    {record.medical_certificate && (
                      <div className="mb-4 p-4 bg-green-50 rounded-xl">
                        <h3 className="text-lg font-bold text-green-900 mb-2">Atestado (Gerado com IA)</h3>
                        <p className="text-green-800 whitespace-pre-wrap">{record.medical_certificate}</p>
                      </div>
                    )}

                    <div className="flex gap-2 mt-4">
                      {!record.prescription && (
                        <Button
                          onClick={() => generateDocument(record.id, 'prescription')}
                          disabled={generating}
                          className="btn-primary"
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          Gerar Receita com IA
                        </Button>
                      )}
                      {!record.medical_certificate && (
                        <Button
                          onClick={() => generateDocument(record.id, 'certificate')}
                          disabled={generating}
                          className="btn-secondary"
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          Gerar Atestado com IA
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <p className="text-sm text-blue-800">
            <strong>Nota:</strong> Os documentos médicos são gerados automaticamente usando IA (OpenAI GPT-4o-mini) 
            baseados nas informações do diagnóstico e tratamento.
          </p>
        </div>
      </div>
    </Layout>
  );
}