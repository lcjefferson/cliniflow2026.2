import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import {
  Building2, MessageCircle, Instagram, Facebook, MessageSquare, Activity, RefreshCw, Copy, ExternalLink,
  AlertTriangle, Info, Save, Eye, EyeOff, ImagePlus, ChevronDown, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "../components/ListKit";

const CHANNEL_META = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle, iconClass: "bg-green-50 text-green-600", switchClass: "data-[state=checked]:bg-green-600" },
  instagram: { label: "Instagram", icon: Instagram, iconClass: "bg-pink-50 text-pink-600", switchClass: "data-[state=checked]:bg-pink-600" },
  messenger: { label: "Messenger", icon: Facebook, iconClass: "bg-blue-50 text-blue-600", switchClass: "data-[state=checked]:bg-blue-600" },
};

function Section({ title, description, footer, children }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {title && (
        <header className="border-b border-slate-100 px-4 py-3.5 md:px-5">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>}
        </header>
      )}
      <div className="p-4 md:p-5">{children}</div>
      {footer && (
        <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:flex-row sm:justify-end md:px-5">
          {footer}
        </footer>
      )}
    </section>
  );
}

function Field({ label, hint, className = "", children }) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Notice({ tone = "info", title, children }) {
  const tones = {
    info: { className: "bg-blue-50 text-blue-800 ring-blue-600/15", icon: Info },
    warning: { className: "bg-amber-50 text-amber-800 ring-amber-600/20", icon: AlertTriangle },
  };
  const { className, icon: Icon } = tones[tone];
  return (
    <div className={`flex gap-2.5 rounded-lg p-3 text-sm ring-1 ring-inset ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="min-w-0 leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

function SecretInput({ value, onChange, placeholder, visible, onToggle }) {
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value || ""}
        onChange={onChange}
        className="pr-10"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        aria-label={visible ? "Ocultar" : "Mostrar"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function CopyField({ value, onCopy, highlight = false }) {
  return (
    <div className="flex gap-2">
      <Input
        type="text"
        value={value}
        readOnly
        onFocus={(e) => e.target.select()}
        className={`font-mono text-xs sm:text-sm ${highlight ? "border-amber-300 bg-amber-50 font-semibold" : "bg-slate-50"}`}
      />
      <Button type="button" variant="outline" size="icon" className="flex-shrink-0 border-slate-200" onClick={() => onCopy(value)} title="Copiar">
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ChannelStatus({ channel, enabled, onChange, activeText }) {
  const meta = CHANNEL_META[channel];
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:px-5">
      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${meta.iconClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{meta.label}</h2>
          <span className={`status-badge ${enabled ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-50 text-slate-500 ring-slate-500/20"}`}>
            {enabled ? "Ativo" : "Inativo"}
          </span>
        </div>
        <p className="truncate text-xs text-slate-500">{enabled ? activeText : "Configure e ative para receber mensagens"}</p>
      </div>
      <Switch checked={!!enabled} onCheckedChange={onChange} className={meta.switchClass} aria-label={`Ativar ${meta.label}`} />
    </div>
  );
}

function HowTo({ title, steps, docsUrl }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 md:px-5 [&::-webkit-details-marker]:hidden">
        <Info className="h-4 w-4 text-blue-600" />
        <span className="flex-1">{title}</span>
        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-100 px-4 py-4 md:px-5">
        <ol className="space-y-2 text-sm text-slate-600">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{i + 1}</span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Documentação completa <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </details>
  );
}

const metaLink = (
  <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 underline">Meta Developers</a>
);

export default function SettingsPageV2() {
  const [activeTab, setActiveTab] = useState("clinic");
  const [showWhatsAppToken, setShowWhatsAppToken] = useState(false);
  const [showInstagramToken, setShowInstagramToken] = useState(false);
  const [showMessengerToken, setShowMessengerToken] = useState(false);
  const [loading, setLoading] = useState(false);

  const [whatsappConfig, setWhatsappConfig] = useState({
    enabled: false,
    provider: "official",
    phone_number_id: "",
    access_token: "",
    verify_token: "",
    webhook_url: "",
    business_account_id: "",
    uazapi_url: "",
    uazapi_token: "",
    uazapi_instance: ""
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

  const [clinicSettings, setClinicSettings] = useState({
    clinic_name: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    logo: ""
  });

  useEffect(() => {
    loadSettings();
    loadClinicSettings();
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

  const loadClinicSettings = async () => {
    try {
      const response = await api.get("/settings/clinic");
      if (response.data) {
        setClinicSettings(response.data);
      }
    } catch (error) {
      console.log("Configurações da clínica não encontradas");
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo muito grande! Tamanho máximo: 2MB");
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error("Apenas imagens são permitidas");
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        setClinicSettings((prev) => ({ ...prev, logo: base64 }));
        toast.success("Logo carregada!");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error("Erro ao carregar logo");
    }
  };

  const handleSaveClinicSettings = async () => {
    setLoading(true);
    try {
      await api.post("/settings/clinic", clinicSettings);
      toast.success("Configurações da clínica salvas!");
    } catch (error) {
      toast.error("Erro ao salvar configurações");
    } finally {
      setLoading(false);
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
      let payload = {};
      if (channel === 'whatsapp') {
        payload = whatsappConfig;
      }

      const response = await api.post(`/settings/omnichannel/${channel}/test`, payload);
      if (response.data.success) {
        toast.success(`Conexão com ${channel} testada com sucesso!`);
      } else {
        toast.error(response.data.detail || `Falha ao conectar com ${channel}`);
      }
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || "Erro ao testar conexão");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  const webhookBaseUrl = process.env.REACT_APP_BACKEND_URL;

  const tabs = [
    { id: "clinic", label: "Clínica", icon: Building2 },
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, enabled: whatsappConfig.enabled },
    { id: "instagram", label: "Instagram", icon: Instagram, enabled: instagramConfig.enabled },
    { id: "messenger", label: "Messenger", icon: Facebook, enabled: messengerConfig.enabled },
  ];

  const saveButton = (onClick, disabled) => (
    <Button onClick={onClick} disabled={disabled} className="gap-2">
      <Save className="h-4 w-4" />
      {loading ? "Salvando..." : "Salvar configurações"}
    </Button>
  );

  const testButton = (channel, disabled, Icon = MessageSquare) => (
    <Button onClick={() => handleTestConnection(channel)} disabled={disabled} variant="outline" className="gap-2 border-slate-200">
      <Icon className="h-4 w-4" />
      Testar conexão
    </Button>
  );

  const tokenSecurityNotice = (
    <Notice tone="warning" title="Importante">
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        <li>Mantenha seus tokens seguros e nunca os compartilhe</li>
        <li>Use tokens permanentes ou configure renovação automática</li>
        <li>Certifique-se de que seu servidor está com HTTPS ativo</li>
        <li>Teste a conexão após salvar as configurações</li>
        <li>As mensagens só começarão a chegar após configurar os webhooks corretamente</li>
      </ul>
    </Notice>
  );

  const renderClinic = () => (
    <Section
      title="Dados da clínica"
      description="Usados em todos os PDFs gerados (receitas, atestados, prontuários): a logo no topo e as informações no rodapé."
      footer={(
        <Button onClick={handleSaveClinicSettings} disabled={loading || !clinicSettings.clinic_name} className="gap-2">
          <Save className="h-4 w-4" />
          {loading ? "Salvando..." : "Salvar alterações"}
        </Button>
      )}
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {clinicSettings.logo ? (
              <img src={clinicSettings.logo} alt="Logo da clínica" className="h-full w-full object-contain p-1.5" />
            ) : (
              <Building2 className="h-8 w-8 text-slate-300" />
            )}
          </div>
          <div>
            <input type="file" id="logo-upload-clinic" className="hidden" accept="image/*" onChange={handleLogoUpload} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 border-slate-200"
              onClick={() => document.getElementById('logo-upload-clinic').click()}
            >
              <ImagePlus className="h-4 w-4" />
              {clinicSettings.logo ? "Trocar logo" : "Enviar logo"}
            </Button>
            <p className="mt-1.5 text-xs text-slate-500">PNG ou JPG, até 2 MB</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nome da clínica *" className="md:col-span-2">
            <Input
              value={clinicSettings.clinic_name || ""}
              onChange={(e) => setClinicSettings({ ...clinicSettings, clinic_name: e.target.value })}
              placeholder="Ex.: Clínica Odontológica São Paulo"
            />
          </Field>
          <Field label="Endereço completo" className="md:col-span-2">
            <Input
              value={clinicSettings.address || ""}
              onChange={(e) => setClinicSettings({ ...clinicSettings, address: e.target.value })}
              placeholder="Rua, número, bairro, cidade - UF, CEP"
            />
          </Field>
          <Field label="Telefone">
            <Input
              type="tel"
              value={clinicSettings.phone || ""}
              onChange={(e) => setClinicSettings({ ...clinicSettings, phone: e.target.value })}
              placeholder="(85) 98765-4321"
            />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              value={clinicSettings.email || ""}
              onChange={(e) => setClinicSettings({ ...clinicSettings, email: e.target.value })}
              placeholder="contato@clinica.com.br"
            />
          </Field>
          <Field label="Website (opcional)" className="md:col-span-2">
            <Input
              value={clinicSettings.website || ""}
              onChange={(e) => setClinicSettings({ ...clinicSettings, website: e.target.value })}
              placeholder="https://www.clinica.com.br"
            />
          </Field>
        </div>
      </div>
    </Section>
  );

  const renderWhatsApp = () => {
    const isUaz = whatsappConfig.provider === "uazapi";
    const webhookUrl = `${webhookBaseUrl}/api/webhooks/whatsapp`;
    return (
      <div className="space-y-4">
        <ChannelStatus
          channel="whatsapp"
          enabled={whatsappConfig.enabled}
          onChange={(v) => setWhatsappConfig({ ...whatsappConfig, enabled: v })}
          activeText="WhatsApp Business API conectado"
        />

        <HowTo
          title="Como obter as credenciais do WhatsApp"
          docsUrl="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
          steps={[
            <>Acesse o {metaLink}</>,
            'Crie um app do tipo "Business"',
            'Adicione o produto "WhatsApp"',
            "Configure um número de telefone",
            "Copie o Phone Number ID e o Access Token",
            "Configure o webhook com a URL fornecida abaixo",
          ]}
        />

        <Section
          title="Configuração da API"
          footer={(
            <>
              {testButton("whatsapp", loading || !whatsappConfig.enabled)}
              {saveButton(handleSaveWhatsApp, loading)}
            </>
          )}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Provedor *" hint="Selecione o provedor de WhatsApp" className="md:col-span-2">
              <select
                className="input-field"
                value={whatsappConfig.provider || "official"}
                onChange={(e) => setWhatsappConfig({ ...whatsappConfig, provider: e.target.value })}
              >
                <option value="official">Meta (Oficial)</option>
                <option value="uazapi">UazApi (Evolution/WPPConnect)</option>
              </select>
            </Field>

            {isUaz ? (
              <>
                <Field label="UazApi URL *" hint="URL base da API (sem barra no final)" className="md:col-span-2">
                  <Input
                    type="text"
                    placeholder="Ex.: https://api.uazapi.com"
                    value={whatsappConfig.uazapi_url || ""}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, uazapi_url: e.target.value })}
                  />
                </Field>
                <Field label="API Key / Token *" hint="Chave de autenticação da API">
                  <SecretInput
                    placeholder="Sua chave de API..."
                    value={whatsappConfig.uazapi_token}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, uazapi_token: e.target.value })}
                    visible={showWhatsAppToken}
                    onToggle={() => setShowWhatsAppToken(!showWhatsAppToken)}
                  />
                </Field>
                <Field label="Instance Name *" hint="Nome da instância conectada">
                  <Input
                    type="text"
                    placeholder="Ex.: ClinicaPrincipal"
                    value={whatsappConfig.uazapi_instance || ""}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, uazapi_instance: e.target.value })}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Phone Number ID *" hint="ID do número de telefone do WhatsApp Business">
                  <Input
                    type="text"
                    placeholder="Ex.: 123456789012345"
                    value={whatsappConfig.phone_number_id || ""}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, phone_number_id: e.target.value })}
                  />
                </Field>
                <Field label="Business Account ID" hint="ID da conta WhatsApp Business">
                  <Input
                    type="text"
                    placeholder="Ex.: 987654321098765"
                    value={whatsappConfig.business_account_id || ""}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, business_account_id: e.target.value })}
                  />
                </Field>
                <Field label="Access Token *" hint="Token de acesso permanente da API">
                  <SecretInput
                    placeholder="EAAxxxxxxxxxxxxx..."
                    value={whatsappConfig.access_token}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, access_token: e.target.value })}
                    visible={showWhatsAppToken}
                    onToggle={() => setShowWhatsAppToken(!showWhatsAppToken)}
                  />
                </Field>
                <Field label="Verify Token *" hint="Token para verificação do webhook (crie um aleatório)">
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="Ex.: meu_token_secreto_123"
                      value={whatsappConfig.verify_token || ""}
                      onChange={(e) => setWhatsappConfig({ ...whatsappConfig, verify_token: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="flex-shrink-0 border-slate-200"
                      title="Gerar token aleatório"
                      onClick={() => {
                        const randomToken = Math.random().toString(36).substring(2, 15);
                        setWhatsappConfig({ ...whatsappConfig, verify_token: randomToken });
                      }}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </Field>
                <Field label="Webhook URL" hint="Use esta URL no painel do Meta Developers" className="md:col-span-2">
                  <CopyField value={webhookUrl} onCopy={copyToClipboard} />
                </Field>
              </>
            )}
          </div>
        </Section>

        {!isUaz && whatsappConfig.verify_token && (
          <Section
            title="Como configurar o webhook no Meta for Developers"
            description="Siga os passos com as credenciais acima já salvas."
          >
            <ol className="space-y-4">
              <WebhookStep n={1} title="Acesse o Meta for Developers">
                <a
                  href="https://developers.facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Abrir Meta Developers <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </WebhookStep>
              <WebhookStep n={2} title="Vá para Configuração do WhatsApp → Webhook" />
              <WebhookStep n={3} title="Cole suas credenciais">
                <div className="space-y-3">
                  <Field label="Callback URL">
                    <CopyField value={webhookUrl} onCopy={copyToClipboard} />
                  </Field>
                  <Field label="Verify Token" hint="Use exatamente este token no Meta (diferencia maiúsculas e minúsculas)">
                    <CopyField value={whatsappConfig.verify_token} onCopy={copyToClipboard} highlight />
                  </Field>
                </div>
              </WebhookStep>
              <WebhookStep n={4} title='Clique em "Verificar e salvar"'>
                <p className="text-sm text-slate-600">O Meta valida a conexão automaticamente.</p>
              </WebhookStep>
              <WebhookStep n={5} title="Inscreva-se nos eventos">
                <p className="text-sm text-slate-600">
                  Marque <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">messages</code> e{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">message_status</code>
                </p>
              </WebhookStep>
            </ol>
            <div className="mt-5">
              <Notice title="Se encontrar erro de validação, confira se:">
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>Você salvou as configurações acima antes de testar no Meta</li>
                  <li>O verify token está exatamente igual (sem espaços)</li>
                  <li>Sua aplicação está acessível publicamente (HTTPS obrigatório)</li>
                </ul>
              </Notice>
            </div>
          </Section>
        )}

        {tokenSecurityNotice}
      </div>
    );
  };

  const renderInstagram = () => (
    <div className="space-y-4">
      <ChannelStatus
        channel="instagram"
        enabled={instagramConfig.enabled}
        onChange={(v) => setInstagramConfig({ ...instagramConfig, enabled: v })}
        activeText="Instagram Messaging API conectado"
      />

      <HowTo
        title="Como obter as credenciais do Instagram"
        docsUrl="https://developers.facebook.com/docs/messenger-platform/instagram"
        steps={[
          <>Acesse o {metaLink}</>,
          "Crie ou use um app existente",
          'Adicione o produto "Instagram"',
          "Conecte uma página do Instagram Business",
          "Copie o Page ID e o Access Token",
          "Configure o webhook com a URL fornecida abaixo",
          "Solicite as permissões instagram_manage_messages e pages_manage_metadata",
        ]}
      />

      <Section
        title="Configuração da API"
        footer={(
          <>
            {testButton("instagram", loading || !instagramConfig.enabled)}
            {saveButton(handleSaveInstagram, loading || !instagramConfig.page_id || !instagramConfig.access_token || !instagramConfig.verify_token)}
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Instagram Page ID *" hint="ID da página do Instagram Business">
            <Input
              type="text"
              placeholder="Ex.: 123456789012345"
              value={instagramConfig.page_id || ""}
              onChange={(e) => setInstagramConfig({ ...instagramConfig, page_id: e.target.value })}
            />
          </Field>
          <Field label="Access Token *" hint="Token de acesso da página">
            <SecretInput
              placeholder="EAAxxxxxxxxxxxxx..."
              value={instagramConfig.access_token}
              onChange={(e) => setInstagramConfig({ ...instagramConfig, access_token: e.target.value })}
              visible={showInstagramToken}
              onToggle={() => setShowInstagramToken(!showInstagramToken)}
            />
          </Field>
          <Field label="Verify Token *" hint="Token para verificação do webhook">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Ex.: meu_token_secreto_123"
                value={instagramConfig.verify_token || ""}
                onChange={(e) => setInstagramConfig({ ...instagramConfig, verify_token: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="flex-shrink-0 border-slate-200"
                title="Gerar token aleatório"
                onClick={() => {
                  const randomToken = Math.random().toString(36).substring(2, 15);
                  setInstagramConfig({ ...instagramConfig, verify_token: randomToken });
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </Field>
          <Field label="Webhook URL" hint="Use esta URL no painel do Meta Developers" className="md:col-span-2">
            <CopyField value={`${webhookBaseUrl}/api/webhooks/instagram`} onCopy={copyToClipboard} />
          </Field>
        </div>
      </Section>

      {tokenSecurityNotice}
    </div>
  );

  const renderMessenger = () => (
    <div className="space-y-4">
      <ChannelStatus
        channel="messenger"
        enabled={messengerConfig.enabled}
        onChange={(v) => setMessengerConfig({ ...messengerConfig, enabled: v })}
        activeText="Messenger API conectado"
      />

      <HowTo
        title="Como obter as credenciais do Messenger"
        docsUrl="https://developers.facebook.com/docs/messenger-platform"
        steps={[
          <>Acesse o {metaLink}</>,
          "Crie ou use um app existente",
          'Adicione o produto "Messenger"',
          "Conecte uma página do Facebook",
          "Copie o Page ID e o Page Access Token",
          "Configure o webhook com a URL fornecida abaixo",
          "Solicite as permissões pages_messaging e pages_manage_metadata",
        ]}
      />

      <Section
        title="Configuração da API"
        footer={(
          <>
            {testButton("messenger", loading, Activity)}
            {saveButton(handleSaveMessenger, loading || !messengerConfig.page_id || !messengerConfig.access_token || !messengerConfig.verify_token)}
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Page ID *" hint="ID da página do Facebook">
            <Input
              type="text"
              placeholder="Ex.: 123456789012345"
              value={messengerConfig.page_id || ""}
              onChange={(e) => setMessengerConfig({ ...messengerConfig, page_id: e.target.value })}
            />
          </Field>
          <Field label="Page Access Token *" hint="Token de acesso da página">
            <SecretInput
              placeholder="EAAxxxxxxxxxxxxx..."
              value={messengerConfig.access_token}
              onChange={(e) => setMessengerConfig({ ...messengerConfig, access_token: e.target.value })}
              visible={showMessengerToken}
              onToggle={() => setShowMessengerToken(!showMessengerToken)}
            />
          </Field>
          <Field label="Verify Token *" hint="Token para validação do webhook (escolha um aleatório)">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Ex.: meu_token_secreto_messenger"
                value={messengerConfig.verify_token || ""}
                onChange={(e) => setMessengerConfig({ ...messengerConfig, verify_token: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                className="flex-shrink-0 border-slate-200"
                onClick={() => setMessengerConfig({ ...messengerConfig, verify_token: `verify_${Math.random().toString(36).substr(2, 9)}` })}
              >
                Gerar
              </Button>
            </div>
          </Field>
          <Field label="Webhook URL" hint="Copie para o painel do Meta" className="md:col-span-2">
            <CopyField value={`${webhookBaseUrl}/api/webhooks/messenger`} onCopy={copyToClipboard} />
          </Field>
        </div>
      </Section>

      {tokenSecurityNotice}
    </div>
  );

  const content = {
    clinic: renderClinic,
    whatsapp: renderWhatsApp,
    instagram: renderInstagram,
    messenger: renderMessenger,
  }[activeTab];

  return (
    <Layout>
      <div>
        <PageHeader title="Configurações" subtitle="Dados da clínica e canais de atendimento do Omnichannel" testId="settings-page-title" />

        <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-6">
          <nav
            className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-1 [scrollbar-width:none] lg:sticky lg:top-6 lg:mx-0 lg:mb-0 lg:flex-col lg:border-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
            aria-label="Seções de configurações"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={active ? "page" : undefined}
                  className={`-mb-px flex flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-2 pb-2.5 pt-1 text-sm font-medium transition-colors lg:mb-0 lg:rounded-lg lg:border-0 lg:px-3 lg:py-2 ${
                    active
                      ? "border-blue-600 text-blue-600 lg:bg-blue-50"
                      : "border-transparent text-slate-500 hover:text-slate-800 lg:hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="lg:flex-1 lg:text-left">{tab.label}</span>
                  {tab.enabled && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-label="Ativo" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="min-w-0">{content()}</div>
        </div>
      </div>
    </Layout>
  );
}

function WebhookStep({ n, title, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        {children && <div className="mt-2">{children}</div>}
      </div>
    </li>
  );
}
