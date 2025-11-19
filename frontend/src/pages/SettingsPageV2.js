import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { 
  Settings as SettingsIcon, MessageSquare, CheckCircle, XCircle, 
  RefreshCw, Copy, ExternalLink, AlertCircle, Info, Save, Eye, EyeOff
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPageV2() {
  const [activeTab, setActiveTab] = useState("whatsapp");
  const [showWhatsAppToken, setShowWhatsAppToken] = useState(false);
  const [showInstagramToken, setShowInstagramToken] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [whatsappConfig, setWhatsappConfig] = useState({
    enabled: false,
    phone_number_id: "",
    access_token: "",
    verify_token: "",
    webhook_url: "",
    business_account_id: ""
  });

  const [instagramConfig, setInstagramConfig] = useState({
    enabled: false,
    page_id: "",
    access_token: "",
    verify_token: "",
    webhook_url: ""
  });

  const [messengerConfig, setMessengerConfig] = useState({
    enabled: false,
    page_id: "",
    access_token: "",
    verify_token: "",
    webhook_url: ""
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await api.get("/settings/omnichannel");
      if (response.data.whatsapp) setWhatsappConfig(response.data.whatsapp);
      if (response.data.instagram) setInstagramConfig(response.data.instagram);
      if (response.data.messenger) setMessengerConfig(response.data.messenger);
    } catch (error) {
      console.log("Configurações não encontradas, usando padrão");
    }
  };

  const handleSaveWhatsApp = async () => {
    setLoading(true);
    try {
      await api.post("/settings/omnichannel/whatsapp", whatsappConfig);
      toast.success("Configurações do WhatsApp salvas!");
      loadSettings();
    } catch (error) {
      toast.error("Erro ao salvar configurações");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInstagram = async () => {
    setLoading(true);
    try {
      await api.post("/settings/omnichannel/instagram", instagramConfig);
      toast.success("Configurações do Instagram salvas!");
      loadSettings();
    } catch (error) {
      toast.error("Erro ao salvar configurações");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMessenger = async () => {
    setLoading(true);
    try {
      await api.post("/settings/omnichannel/messenger", messengerConfig);
      toast.success("Configurações do Messenger salvas!");
      loadSettings();
    } catch (error) {
      toast.error("Erro ao salvar configurações");
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (channel) => {
    setLoading(true);
    try {
      const response = await api.post(`/settings/omnichannel/${channel}/test`);
      if (response.data.success) {
        toast.success(`Conexão com ${channel} testada com sucesso!`);
      } else {
        toast.error(`Falha ao conectar com ${channel}`);
      }
    } catch (error) {
      toast.error("Erro ao testar conexão");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  const webhookBaseUrl = window.location.origin;

  const tabs = [
    { id: "whatsapp", label: "WhatsApp", icon: "💬", color: "green" },
    { id: "instagram", label: "Instagram", icon: "📷", color: "pink" },
    { id: "messenger", label: "Messenger", icon: "💌", color: "blue" }
  ];

  return (
    <Layout>
      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <SettingsIcon className="w-10 h-10 text-blue-600" />
            Configurações de Omnichannel
          </h1>
          <p className="text-gray-600">Configure as integrações com WhatsApp, Instagram e Messenger</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 font-medium transition-all border-b-2 ${
                activeTab === tab.id
                  ? `border-${tab.color}-500 text-${tab.color}-600 bg-${tab.color}-50`
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              <span className="text-2xl">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* WhatsApp Tab */}
        {activeTab === "whatsapp" && (
          <div className="space-y-6">
            {/* Status Card */}
            <div className={`rounded-xl p-6 ${whatsappConfig.enabled ? "bg-green-50 border-2 border-green-200" : "bg-gray-50 border-2 border-gray-200"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {whatsappConfig.enabled ? (
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  ) : (
                    <XCircle className="w-8 h-8 text-gray-400" />
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Status: {whatsappConfig.enabled ? "Ativo" : "Inativo"}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {whatsappConfig.enabled ? "WhatsApp Business API conectado" : "Configure para ativar"}
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whatsappConfig.enabled}
                    onChange={(e) => setWhatsappConfig({...whatsappConfig, enabled: e.target.checked})}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <Info className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-900 mb-2">Como obter as credenciais do WhatsApp:</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
                    <li>Acesse <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">Meta Developers</a></li>
                    <li>Crie um app de tipo "Business"</li>
                    <li>Adicione o produto "WhatsApp"</li>
                    <li>Configure um número de telefone</li>
                    <li>Copie o Phone Number ID e Access Token</li>
                    <li>Configure o webhook com a URL fornecida abaixo</li>
                  </ol>
                  <a 
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-3 text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Documentação Completa <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Configuration Form */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuração da API</h3>
              
              <div>
                <Label>Phone Number ID *</Label>
                <Input
                  type="text"
                  placeholder="Ex: 123456789012345"
                  value={whatsappConfig.phone_number_id}
                  onChange={(e) => setWhatsappConfig({...whatsappConfig, phone_number_id: e.target.value})}
                />
                <p className="text-xs text-gray-500 mt-1">ID do número de telefone do WhatsApp Business</p>
              </div>

              <div>
                <Label>Business Account ID</Label>
                <Input
                  type="text"
                  placeholder="Ex: 987654321098765"
                  value={whatsappConfig.business_account_id}
                  onChange={(e) => setWhatsappConfig({...whatsappConfig, business_account_id: e.target.value})}
                />
                <p className="text-xs text-gray-500 mt-1">ID da conta WhatsApp Business</p>
              </div>

              <div>
                <Label>Access Token *</Label>
                <div className="relative">
                  <Input
                    type={showWhatsAppToken ? "text" : "password"}
                    placeholder="EAAxxxxxxxxxxxxx..."
                    value={whatsappConfig.access_token}
                    onChange={(e) => setWhatsappConfig({...whatsappConfig, access_token: e.target.value})}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowWhatsAppToken(!showWhatsAppToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showWhatsAppToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Token de acesso permanente da API</p>
              </div>

              <div>
                <Label>Verify Token *</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Ex: meu_token_secreto_123"
                    value={whatsappConfig.verify_token}
                    onChange={(e) => setWhatsappConfig({...whatsappConfig, verify_token: e.target.value})}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const randomToken = Math.random().toString(36).substring(2, 15);
                      setWhatsappConfig({...whatsappConfig, verify_token: randomToken});
                    }}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Token para verificação do webhook (crie um aleatório)</p>
              </div>

              <div>
                <Label>Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={`${webhookBaseUrl}/api/webhooks/whatsapp`}
                    readOnly
                    className="bg-gray-50"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copyToClipboard(`${webhookBaseUrl}/api/webhooks/whatsapp`)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Use esta URL no painel do Meta Developers</p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleSaveWhatsApp}
                  disabled={loading || !whatsappConfig.phone_number_id || !whatsappConfig.access_token || !whatsappConfig.verify_token}
                  className="btn-primary"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Configurações
                </Button>
                <Button
                  onClick={() => handleTestConnection("whatsapp")}
                  disabled={loading || !whatsappConfig.enabled}
                  variant="outline"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Testar Conexão
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Instagram Tab */}
        {activeTab === "instagram" && (
          <div className="space-y-6">
            {/* Status Card */}
            <div className={`rounded-xl p-6 ${instagramConfig.enabled ? "bg-pink-50 border-2 border-pink-200" : "bg-gray-50 border-2 border-gray-200"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {instagramConfig.enabled ? (
                    <CheckCircle className="w-8 h-8 text-pink-600" />
                  ) : (
                    <XCircle className="w-8 h-8 text-gray-400" />
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Status: {instagramConfig.enabled ? "Ativo" : "Inativo"}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {instagramConfig.enabled ? "Instagram Messaging API conectado" : "Configure para ativar"}
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={instagramConfig.enabled}
                    onChange={(e) => setInstagramConfig({...instagramConfig, enabled: e.target.checked})}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-pink-600"></div>
                </label>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-pink-50 border border-pink-200 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <Info className="w-6 h-6 text-pink-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-pink-900 mb-2">Como obter as credenciais do Instagram:</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-pink-800">
                    <li>Acesse <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">Meta Developers</a></li>
                    <li>Crie ou use um app existente</li>
                    <li>Adicione o produto "Instagram"</li>
                    <li>Conecte uma página do Instagram Business</li>
                    <li>Copie o Page ID e Access Token</li>
                    <li>Configure o webhook com a URL fornecida abaixo</li>
                    <li>Solicite permissões: instagram_manage_messages, pages_manage_metadata</li>
                  </ol>
                  <a 
                    href="https://developers.facebook.com/docs/messenger-platform/instagram" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-3 text-pink-600 hover:text-pink-700 font-medium"
                  >
                    Documentação Completa <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Configuration Form */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuração da API</h3>
              
              <div>
                <Label>Instagram Page ID *</Label>
                <Input
                  type="text"
                  placeholder="Ex: 123456789012345"
                  value={instagramConfig.page_id}
                  onChange={(e) => setInstagramConfig({...instagramConfig, page_id: e.target.value})}
                />
                <p className="text-xs text-gray-500 mt-1">ID da página do Instagram Business</p>
              </div>

              <div>
                <Label>Access Token *</Label>
                <div className="relative">
                  <Input
                    type={showInstagramToken ? "text" : "password"}
                    placeholder="EAAxxxxxxxxxxxxx..."
                    value={instagramConfig.access_token}
                    onChange={(e) => setInstagramConfig({...instagramConfig, access_token: e.target.value})}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowInstagramToken(!showInstagramToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showInstagramToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Token de acesso da página</p>
              </div>

              <div>
                <Label>Verify Token *</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Ex: meu_token_secreto_123"
                    value={instagramConfig.verify_token}
                    onChange={(e) => setInstagramConfig({...instagramConfig, verify_token: e.target.value})}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const randomToken = Math.random().toString(36).substring(2, 15);
                      setInstagramConfig({...instagramConfig, verify_token: randomToken});
                    }}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Token para verificação do webhook</p>
              </div>

              <div>
                <Label>Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={`${webhookBaseUrl}/api/webhooks/instagram`}
                    readOnly
                    className="bg-gray-50"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copyToClipboard(`${webhookBaseUrl}/api/webhooks/instagram`)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Use esta URL no painel do Meta Developers</p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleSaveInstagram}
                  disabled={loading || !instagramConfig.page_id || !instagramConfig.access_token || !instagramConfig.verify_token}
                  className="btn-primary"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Configurações
                </Button>
                <Button
                  onClick={() => handleTestConnection("instagram")}
                  disabled={loading || !instagramConfig.enabled}
                  variant="outline"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Testar Conexão
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Messenger Tab */}
        {activeTab === "messenger" && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <Info className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-900 mb-2">Messenger (Facebook Messenger)</h4>
                  <p className="text-sm text-blue-800">
                    A configuração do Messenger é similar ao Instagram. Use o mesmo processo com o produto "Messenger" no Meta Developers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Warning Card */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mt-8">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-orange-900 mb-2">⚠️ Importante:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-orange-800">
                <li>Mantenha seus tokens seguros e nunca os compartilhe</li>
                <li>Use tokens permanentes ou configure renovação automática</li>
                <li>Certifique-se de que seu servidor está com HTTPS ativo</li>
                <li>Teste a conexão após salvar as configurações</li>
                <li>As mensagens só começarão a chegar após configurar os webhooks corretamente</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
