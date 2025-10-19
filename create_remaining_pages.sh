#!/bin/bash

# Criar todas as páginas restantes de forma simplificada

for page in Services Rooms Patients Calendar Leads FollowUp Omnichannel MedicalRecords Revenue; do
  cat > "/app/frontend/src/pages/${page}Page.js" << EOF
import React from "react";
import Layout from "../components/Layout";

export default function ${page}Page() {
  return (
    <Layout>
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-8" data-testid="${page,,}-page-title">${page}</h1>
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <p className="text-gray-600">Página de ${page} - Em desenvolvimento</p>
        </div>
      </div>
    </Layout>
  );
}
EOF
done

echo "Páginas criadas com sucesso!"
