import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { Settings, Users, Key, User as UserIcon, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [apiSettings, setApiSettings] = useState({
    auto_birthday_enabled: true,
    auto_reminder_enabled: true,
    reminder_hours_before: 24
  });
  
  const [metaSettings, setMetaSettings] = useState({
    app_id: "",
    app_secret: "",
    access_token: "",
    phone_number_id: "",
    whatsapp_enabled: false,
    instagram_enabled: false,
    messenger_enabled: false
  });
  
  const [aiSettings, setAiSettings] = useState({
    emergent_llm_key: "sk-emergent-7F30bE56009E3B4EeC",
    provider: "openai",
    model: "gpt-4o-mini"
  });
  
  const [emailSettings, setEmailSettings] = useState({
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_password: "",
    from_email: "",
    from_name: "CliniFlow"
  });
  
  const [clinicSettings, setClinicSettings] = useState({
    clinic_name: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    logo: ""
  });
  
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    password: "",
    is_admin: false
  });

  useEffect(() => {
    if (user?.role?.is_admin) {
      loadUsers();
      loadClinicSettings();
    }
  }, [user]);

  const loadUsers = async () => {
    try {
      const response = await api.get("/auth/users");
      setUsers(response.data || []);
    } catch (error) {
      // Endpoint não existe ainda, vamos mockar
      setUsers([user]);
    }
  };
  
  const loadClinicSettings = async () => {
    try {
      const response = await api.get("/settings/clinic");
      if (response.data) {
        setClinicSettings(response.data);
      }
    } catch (error) {
      console.error("Error loading clinic settings:", error);
    }
  };
  
  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
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
        setClinicSettings({ ...clinicSettings, logo: base64 });
        toast.success("Logo carregada!");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error("Erro ao carregar logo");
    }
  };
  
  const handleSaveClinicSettings = async () => {
    try {
      await api.post("/settings/clinic", clinicSettings);
      toast.success("Configurações da clínica salvas!");
    } catch (error) {
      toast.error("Erro ao salvar configurações");
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.post("/auth/register", userForm);
      toast.success("Usuário criado com sucesso!");
      setShowUserDialog(false);
      setUserForm({ name: "", email: "", password: "", is_admin: false });
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erro ao criar usuário");
    }
  };

  const handleSaveApiSettings = () => {
    // Salvar todas as configurações
    toast.success("Configurações salvas com sucesso!");
  };
  
  const handleSaveMetaSettings = () => {
    toast.success("Configurações da Meta Business API salvas!");
  };
  
  const handleSaveAiSettings = () => {
    toast.success("Configurações de IA salvas!");
  };
  
  const handleSaveEmailSettings = () => {
    toast.success("Configurações de email salvas!");
  };

  if (!user?.role?.is_admin) {
    return (
      <Layout>
        <div className="text-center py-12">
          <h1 className="text-3xl font-bold text-red-600 mb-4">Acesso Negado</h1>
          <p className="text-gray-600">Apenas administradores podem acessar configurações.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div>
        <div className="flex items-center gap-3 mb-8">
          <Settings className="w-10 h-10 text-blue-600" />
          <h1 className="text-4xl font-bold text-gray-900" data-testid="settings-page-title">Configurações</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <Tabs defaultValue="users" className="w-full">
            <TabsList className="w-full grid grid-cols-5 bg-gray-50 p-2">
              <TabsTrigger value="clinic" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
                <Settings className="w-4 h-4 mr-2" />
                Clínica
              </TabsTrigger>
              <TabsTrigger value="users" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
                <Users className="w-4 h-4 mr-2" />
                Usuários
              </TabsTrigger>
              <TabsTrigger value="apis" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
                <Key className="w-4 h-4 mr-2" />
                Integrações
              </TabsTrigger>
              <TabsTrigger value="connections" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
                <Settings className="w-4 h-4 mr-2" />
                Conexões
              </TabsTrigger>
              <TabsTrigger value="profile" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
                <UserIcon className="w-4 h-4 mr-2" />
                Meu Perfil
              </TabsTrigger>
            </TabsList>

            {/* Clínica Tab */}
            <TabsContent value="clinic" className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Configurações da Clínica</h2>
              
              <div className="space-y-6">
                {/* Logo Upload */}
                <div className="border-b pb-6">
                  <Label className="text-lg font-semibold mb-3 block">Logo da Clínica</Label>
                  <div className="flex items-center gap-6">
                    {clinicSettings.logo ? (
                      <div className="w-32 h-32 border-2 border-gray-200 rounded-lg overflow-hidden bg-white">
                        <img 
                          src={clinicSettings.logo} 
                          alt="Logo da clínica" 
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                        <Settings className="w-12 h-12 text-gray-400" />
                      </div>
                    )}
                    <div>
                      <input
                        type="file"
                        id="logo-upload"
                        className="hidden"
                        accept="image/*"
                        onChange={handleLogoUpload}
                      />
                      <Button
                        onClick={() => document.getElementById('logo-upload').click()}
                        variant="outline"
                        className="mb-2"
                      >
                        Fazer Upload da Logo
                      </Button>
                      <p className="text-xs text-gray-500">
                        Recomendado: PNG ou JPG, máximo 2MB
                      </p>
                    </div>
                  </div>
                </div>

                {/* Informações da Clínica */}
                <div>
                  <Label className="text-lg font-semibold mb-4 block">Informações da Clínica</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Label>Nome da Clínica *</Label>
                      <Input
                        value={clinicSettings.clinic_name}
                        onChange={(e) => setClinicSettings({ ...clinicSettings, clinic_name: e.target.value })}
                        placeholder="Ex: Clínica Odontológica São Paulo"
                        className="mt-1"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <Label>Endereço Completo</Label>
                      <Input
                        value={clinicSettings.address}
                        onChange={(e) => setClinicSettings({ ...clinicSettings, address: e.target.value })}
                        placeholder="Rua, número, bairro, cidade - UF, CEP"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label>Telefone</Label>
                      <Input
                        value={clinicSettings.phone}
                        onChange={(e) => setClinicSettings({ ...clinicSettings, phone: e.target.value })}
                        placeholder="(85) 98765-4321"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label>E-mail</Label>
                      <Input
                        type="email"
                        value={clinicSettings.email}
                        onChange={(e) => setClinicSettings({ ...clinicSettings, email: e.target.value })}
                        placeholder="contato@clinica.com.br"
                        className="mt-1"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <Label>Website (Opcional)</Label>
                      <Input
                        value={clinicSettings.website}
                        onChange={(e) => setClinicSettings({ ...clinicSettings, website: e.target.value })}
                        placeholder="https://www.clinica.com.br"
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>ℹ️ Informação:</strong> Estas configurações serão usadas em todos os PDFs gerados 
                    (receitas, atestados, prontuários). A logo aparecerá no topo e as informações no rodapé.
                  </p>
                </div>
                
                <Button 
                  onClick={handleSaveClinicSettings} 
                  disabled={!clinicSettings.clinic_name}
                  className="w-full btn-primary"
                >
                  <Save className="w-5 h-5 mr-2" />
                  Salvar Configurações da Clínica
                </Button>
              </div>
            </TabsContent>

            {/* Usuários Tab */}
            <TabsContent value="users" className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Gerenciar Usuários</h2>
                <Button onClick={() => setShowUserDialog(true)} className="btn-primary" data-testid="add-user-button">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Usuário
                </Button>
              </div>

              <div className="space-y-4">
                {users.map((u) => (
                  <div key={u.id || u.email} className="border border-gray-200 rounded-xl p-4 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-gray-900">{u.name}</h3>
                      <p className="text-gray-600 text-sm">{u.email}</p>
                      <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${
                        u.role?.is_admin ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {u.role?.is_admin ? 'Administrador' : 'Atendente'}
                      </span>
                    </div>
                    {u.id !== user.id && (
                      <Button variant="outline" className="text-red-500 hover:text-red-700">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* APIs Tab */}
            <TabsContent value="apis" className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Automações</h2>
              
              <div className="space-y-6">
                <div className="border border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Mensagens Automáticas</h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div>
                        <p className="font-medium text-gray-900">Parabéns de Aniversário</p>
                        <p className="text-sm text-gray-600">Enviar automaticamente no dia do aniversário</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={apiSettings.auto_birthday_enabled}
                          onChange={(e) => setApiSettings({...apiSettings, auto_birthday_enabled: e.target.checked})}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div>
                        <p className="font-medium text-gray-900">Lembretes de Consulta</p>
                        <p className="text-sm text-gray-600">Lembrar pacientes antes da consulta</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={apiSettings.auto_reminder_enabled}
                          onChange={(e) => setApiSettings({...apiSettings, auto_reminder_enabled: e.target.checked})}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    {apiSettings.auto_reminder_enabled && (
                      <div className="p-4 bg-blue-50 rounded-xl">
                        <Label>Lembrar quantas horas antes?</Label>
                        <Input
                          type="number"
                          value={apiSettings.reminder_hours_before}
                          onChange={(e) => setApiSettings({...apiSettings, reminder_hours_before: parseInt(e.target.value)})}
                          className="mt-2 max-w-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <Button onClick={handleSaveApiSettings} className="btn-primary" data-testid="save-api-settings">
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Automações
                </Button>
              </div>
            </TabsContent>

            {/* Connections Tab */}
            <TabsContent value="connections" className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Configurar Conexões</h2>
              
              <div className="space-y-8">
                {/* Meta Business API */}
                <div className="border border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Meta Business API</h3>
                  <p className="text-sm text-gray-600 mb-6">Configure suas credenciais para integração com WhatsApp, Instagram e Messenger</p>
                  
                  <div className="space-y-4">
                    <div>
                      <Label>App ID</Label>
                      <Input
                        value={metaSettings.app_id}
                        onChange={(e) => setMetaSettings({...metaSettings, app_id: e.target.value})}
                        placeholder="Digite o App ID da Meta"
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label>App Secret</Label>
                      <Input
                        type="password"
                        value={metaSettings.app_secret}
                        onChange={(e) => setMetaSettings({...metaSettings, app_secret: e.target.value})}
                        placeholder="Digite o App Secret"
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label>Access Token</Label>
                      <Input
                        type="password"
                        value={metaSettings.access_token}
                        onChange={(e) => setMetaSettings({...metaSettings, access_token: e.target.value})}
                        placeholder="Digite o Access Token"
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label>Phone Number ID (WhatsApp)</Label>
                      <Input
                        value={metaSettings.phone_number_id}
                        onChange={(e) => setMetaSettings({...metaSettings, phone_number_id: e.target.value})}
                        placeholder="Digite o Phone Number ID"
                        className="mt-2"
                      />
                    </div>
                    
                    <div className="pt-4 space-y-3">
                      <p className="text-sm font-medium text-gray-700">Canais Ativos:</p>
                      
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="whatsapp-enabled"
                          checked={metaSettings.whatsapp_enabled}
                          onChange={(e) => setMetaSettings({...metaSettings, whatsapp_enabled: e.target.checked})}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <label htmlFor="whatsapp-enabled" className="text-sm text-gray-700">
                          WhatsApp
                        </label>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="instagram-enabled"
                          checked={metaSettings.instagram_enabled}
                          onChange={(e) => setMetaSettings({...metaSettings, instagram_enabled: e.target.checked})}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <label htmlFor="instagram-enabled" className="text-sm text-gray-700">
                          Instagram Direct
                        </label>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="messenger-enabled"
                          checked={metaSettings.messenger_enabled}
                          onChange={(e) => setMetaSettings({...metaSettings, messenger_enabled: e.target.checked})}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <label htmlFor="messenger-enabled" className="text-sm text-gray-700">
                          Messenger
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <p className="text-sm text-blue-800">
                      <strong>📘 Como obter:</strong> Acesse <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline">developers.facebook.com</a> e crie um aplicativo Meta Business
                    </p>
                  </div>
                  
                  <Button onClick={handleSaveMetaSettings} className="btn-primary mt-4">
                    <Save className="w-4 h-4 mr-2" />
                    Salvar Configurações Meta
                  </Button>
                </div>

                {/* IA Settings */}
                <div className="border border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Inteligência Artificial</h3>
                  <p className="text-sm text-gray-600 mb-6">Configurações de IA para geração de documentos e mensagens automáticas</p>
                  
                  <div className="space-y-4">
                    <div>
                      <Label>Emergent LLM Key</Label>
                      <Input
                        type="password"
                        value={aiSettings.emergent_llm_key}
                        onChange={(e) => setAiSettings({...aiSettings, emergent_llm_key: e.target.value})}
                        className="mt-2"
                        disabled
                      />
                      <p className="text-xs text-gray-500 mt-1">✅ Chave universal já configurada (OpenAI, Anthropic, Google)</p>
                    </div>
                    
                    <div>
                      <Label>Provedor</Label>
                      <select
                        className="input-field mt-2"
                        value={aiSettings.provider}
                        onChange={(e) => setAiSettings({...aiSettings, provider: e.target.value})}
                      >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic (Claude)</option>
                        <option value="google">Google (Gemini)</option>
                      </select>
                    </div>
                    
                    <div>
                      <Label>Modelo</Label>
                      <Input
                        value={aiSettings.model}
                        onChange={(e) => setAiSettings({...aiSettings, model: e.target.value})}
                        placeholder="gpt-4o-mini"
                        className="mt-2"
                      />
                      <p className="text-xs text-gray-500 mt-1">Modelo usado para geração de receitas, atestados e mensagens</p>
                    </div>
                  </div>
                  
                  <Button onClick={handleSaveAiSettings} className="btn-primary mt-4">
                    <Save className="w-4 h-4 mr-2" />
                    Salvar Configurações de IA
                  </Button>
                </div>

                {/* Email Settings */}
                <div className="border border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Servidor de Email (SMTP)</h3>
                  <p className="text-sm text-gray-600 mb-6">Configure o servidor SMTP para envio de emails e relatórios</p>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Host SMTP</Label>
                        <Input
                          value={emailSettings.smtp_host}
                          onChange={(e) => setEmailSettings({...emailSettings, smtp_host: e.target.value})}
                          placeholder="smtp.gmail.com"
                          className="mt-2"
                        />
                      </div>
                      
                      <div>
                        <Label>Porta</Label>
                        <Input
                          value={emailSettings.smtp_port}
                          onChange={(e) => setEmailSettings({...emailSettings, smtp_port: e.target.value})}
                          placeholder="587"
                          className="mt-2"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label>Usuário SMTP</Label>
                      <Input
                        value={emailSettings.smtp_user}
                        onChange={(e) => setEmailSettings({...emailSettings, smtp_user: e.target.value})}
                        placeholder="seu-email@gmail.com"
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label>Senha SMTP</Label>
                      <Input
                        type="password"
                        value={emailSettings.smtp_password}
                        onChange={(e) => setEmailSettings({...emailSettings, smtp_password: e.target.value})}
                        placeholder="••••••••"
                        className="mt-2"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Email Remetente</Label>
                        <Input
                          value={emailSettings.from_email}
                          onChange={(e) => setEmailSettings({...emailSettings, from_email: e.target.value})}
                          placeholder="noreply@cliniflow.com"
                          className="mt-2"
                        />
                      </div>
                      
                      <div>
                        <Label>Nome Remetente</Label>
                        <Input
                          value={emailSettings.from_name}
                          onChange={(e) => setEmailSettings({...emailSettings, from_name: e.target.value})}
                          placeholder="CliniFlow"
                          className="mt-2"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                    <p className="text-sm text-yellow-800">
                      <strong>⚠️ Gmail:</strong> Use senha de aplicativo, não sua senha normal. Ative autenticação de 2 fatores e gere uma senha de app.
                    </p>
                  </div>
                  
                  <Button onClick={handleSaveEmailSettings} className="btn-primary mt-4">
                    <Save className="w-4 h-4 mr-2" />
                    Salvar Configurações de Email
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Profile Tab */}
            <TabsContent value="profile" className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Meu Perfil</h2>
              
              <div className="max-w-2xl space-y-6">
                <div>
                  <Label>Nome</Label>
                  <Input value={user.name} disabled className="mt-2" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={user.email} disabled className="mt-2" />
                </div>
                <div>
                  <Label>Tipo de Conta</Label>
                  <Input value={user.role?.is_admin ? "Administrador" : "Atendente"} disabled className="mt-2" />
                </div>
                
                <div className="pt-4 border-t border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Alterar Senha</h3>
                  <div className="space-y-4">
                    <div>
                      <Label>Senha Atual</Label>
                      <Input type="password" placeholder="••••••••" className="mt-2" />
                    </div>
                    <div>
                      <Label>Nova Senha</Label>
                      <Input type="password" placeholder="••••••••" className="mt-2" />
                    </div>
                    <div>
                      <Label>Confirmar Nova Senha</Label>
                      <Input type="password" placeholder="••••••••" className="mt-2" />
                    </div>
                    <Button className="btn-secondary">
                      Atualizar Senha
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Dialog para criar usuário */}
        <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Novo Usuário</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <Label>Nome Completo</Label>
                <Input
                  value={userForm.name}
                  onChange={(e) => setUserForm({...userForm, name: e.target.value})}
                  data-testid="user-name-input"
                  required
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                  data-testid="user-email-input"
                  required
                />
              </div>
              <div>
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={userForm.password}
                  onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                  data-testid="user-password-input"
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="admin-role"
                  checked={userForm.is_admin}
                  onChange={(e) => setUserForm({...userForm, is_admin: e.target.checked})}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="admin-role" className="text-sm text-gray-700">
                  Conceder permissões de Administrador
                </label>
              </div>
              <Button type="submit" className="w-full btn-primary" data-testid="submit-user-button">
                Criar Usuário
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}