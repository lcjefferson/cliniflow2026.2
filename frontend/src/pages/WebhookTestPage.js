import React, { useState } from "react";
import Layout from "../components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";

export default function WebhookTestPage() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  
  const webhookUrl = process.env.REACT_APP_BACKEND_URL + "/api/webhooks/whatsapp";
  const verifyToken = "ichrg8pgmhp";

  const testWebhook = async () => {
    setTesting(true);
    setResult(null);

    try {
      const testUrl = `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=TESTE123`;
      
      const response = await fetch(testUrl);
      const text = await response.text();
      
      if (response.ok && text === "TESTE123") {
        setResult({
          success: true,
          message: "✅ Webhook funcionando perfeitamente!",
          details: {
            status: response.status,
            response: text,
            url: testUrl
          }
        });
      } else {
        setResult({
          success: false,
          message: "❌ Webhook retornou resposta inesperada",
          details: {
            status: response.status,
            response: text,
            url: testUrl
          }
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: "❌ Erro ao conectar com webhook",
        error: error.message
      });
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  return (
    <Layout>
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">🔧 Teste do Webhook</h1>
        <p className="text-gray-600 mb-8">Teste se o webhook está funcionando corretamente</p>

        {/* Credenciais */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Suas Credenciais</h3>
          
          <div>
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={webhookUrl}
                readOnly
                className="bg-gray-50 font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => copyToClipboard(webhookUrl)}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div>
            <Label>Verify Token</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={verifyToken}
                readOnly
                className="bg-yellow-50 border-yellow-300 font-mono text-sm font-bold"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => copyToClipboard(verifyToken)}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Botão de Teste */}
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-6 mb-6">
          <p className="text-sm text-blue-800 mb-4">
            Este teste simula exatamente o que o Meta for Developers faz ao verificar o webhook.
          </p>
          <Button
            onClick={testWebhook}
            disabled={testing}
            className="w-full"
          >
            {testing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {testing ? "Testando..." : "🧪 Testar Webhook Agora"}
          </Button>
        </div>

        {/* Resultado */}
        {result && (
          <div className={`rounded-xl border-2 p-6 ${
            result.success 
              ? "bg-green-50 border-green-300" 
              : "bg-red-50 border-red-300"
          }`}>
            <div className="flex items-start gap-3">
              {result.success ? (
                <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
              ) : (
                <XCircle className="w-8 h-8 text-red-600 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h3 className={`text-xl font-bold mb-2 ${
                  result.success ? "text-green-900" : "text-red-900"
                }`}>
                  {result.message}
                </h3>
                
                {result.details && (
                  <div className="bg-white rounded-lg p-4 mt-4 space-y-2">
                    <div>
                      <span className="font-semibold">Status HTTP:</span> {result.details.status}
                    </div>
                    <div>
                      <span className="font-semibold">Resposta:</span> {result.details.response}
                    </div>
                    <div className="text-xs text-gray-600 break-all">
                      <span className="font-semibold">URL testada:</span> {result.details.url}
                    </div>
                  </div>
                )}

                {result.error && (
                  <div className="bg-white rounded-lg p-4 mt-4">
                    <span className="font-semibold">Erro:</span> {result.error}
                  </div>
                )}

                {result.success && (
                  <div className="mt-4 p-4 bg-green-100 rounded-lg border border-green-300">
                    <p className="text-sm text-green-800 font-medium">
                      ✅ Se este teste passou, o webhook está funcionando! 
                      <br />
                      Se o Meta ainda não consegue se conectar, o problema pode ser:
                    </p>
                    <ul className="text-sm text-green-700 list-disc list-inside mt-2 space-y-1">
                      <li>Token copiado com espaços extras</li>
                      <li>URL copiada incorretamente</li>
                      <li>Cache do navegador no Meta for Developers</li>
                      <li>Firewall ou restrições da Meta</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
