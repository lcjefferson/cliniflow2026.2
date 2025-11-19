import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Copy, ExternalLink, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function NgrokWebhookPage() {
  const [tunnelUrl, setTunnelUrl] = useState("https://cliniflow-webhook.loca.lt");
  const verifyToken = "ichrg8pgmhp";
  const webhookPath = "/api/webhooks/whatsapp";
  const fullWebhookUrl = tunnelUrl + webhookPath;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  return (
    <Layout>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            🌐 Túnel Público (LocalTunnel)
          </h1>
          <p className="text-gray-600">Use esta URL temporária para configurar o webhook no Meta for Developers</p>
        </div>

        {/* Status Card */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-xl font-bold text-green-900 mb-2">✅ Túnel Ativo!</h3>
              <p className="text-green-800 mb-4">
                Seu webhook agora está acessível publicamente através do LocalTunnel. 
                O Meta conseguirá validar esta URL!
              </p>
              <div className="bg-white rounded-lg p-4 border border-green-300">
                <p className="text-sm font-semibold text-gray-700 mb-2">URL do Túnel:</p>
                <code className="text-lg font-mono text-green-700 break-all">{tunnelUrl}</code>
              </div>
            </div>
          </div>
        </div>

        {/* Credentials Card */}
        <div className="bg-white rounded-xl border-2 border-blue-300 p-6 mb-6 space-y-4">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            📋 Credenciais para o Meta for Developers
          </h3>

          <div>
            <Label className="text-sm font-semibold">Callback URL (URL de retorno de chamada)</Label>
            <div className="flex gap-2 mt-2">
              <Input
                type="text"
                value={fullWebhookUrl}
                readOnly
                className="bg-blue-50 border-blue-300 font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => copyToClipboard(fullWebhookUrl)}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Cole EXATAMENTE esta URL no Meta for Developers</p>
          </div>

          <div>
            <Label className="text-sm font-semibold">Verify Token (Token de verificação)</Label>
            <div className="flex gap-2 mt-2">
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
            <p className="text-xs text-orange-600 mt-1 font-medium">
              ⚠️ Use EXATAMENTE este token (case-sensitive)
            </p>
          </div>
        </div>

        {/* Instructions Card */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-bold text-blue-900 mb-4">📝 Passo a Passo</h3>
          
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                1
              </div>
              <div>
                <p className="font-semibold text-gray-900">Acesse o Meta for Developers</p>
                <a 
                  href="https://developers.facebook.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 text-sm inline-flex items-center gap-1"
                >
                  Abrir Meta Developers <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <p className="font-semibold text-gray-900">Vá para seu App → WhatsApp → Configuração → Webhook</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                3
              </div>
              <div>
                <p className="font-semibold text-gray-900">Cole a Callback URL e o Verify Token</p>
                <p className="text-sm text-gray-600">Use os botões de copiar acima</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                4
              </div>
              <div>
                <p className="font-semibold text-gray-900">Clique em "Verificar e Salvar"</p>
                <p className="text-sm text-green-600 font-medium">✅ Deve funcionar agora!</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                5
              </div>
              <div>
                <p className="font-semibold text-gray-900">Marque os eventos:</p>
                <div className="flex gap-2 mt-1">
                  <span className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">messages</span>
                  <span className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">message_status</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Warning Card */}
        <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-orange-900 mb-2">⚠️ Importante sobre o LocalTunnel:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-orange-800">
                <li>Esta é uma <strong>URL temporária</strong> para testes</li>
                <li>O túnel pode cair e a URL mudar se o servidor reiniciar</li>
                <li>Para <strong>produção</strong>, faça o deploy da aplicação em um domínio permanente</li>
                <li>Use o botão "Deploy" da plataforma Emergent para publicar em produção</li>
                <li>Na primeira vez que o Meta acessar, pode aparecer uma página de confirmação do LocalTunnel - é normal</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
