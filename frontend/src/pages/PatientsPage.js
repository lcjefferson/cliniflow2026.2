import React from "react";
import Layout from "../components/Layout";

export default function PatientsPage() {
  return (
    <Layout>
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-8" data-testid="patients-page-title">Patients</h1>
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <p className="text-gray-600">Página de Patients - Em desenvolvimento</p>
        </div>
      </div>
    </Layout>
  );
}
