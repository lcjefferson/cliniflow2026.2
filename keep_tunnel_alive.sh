#!/bin/bash

# Script para manter o túnel LocalTunnel sempre ativo
# Execute: bash /app/keep_tunnel_alive.sh

SUBDOMAIN="cliniflow-webhook"
PORT="8001"
LOG_FILE="/tmp/localtunnel.log"

echo "🚀 Iniciando monitoramento do túnel LocalTunnel..."

while true; do
    # Verificar se o túnel está rodando
    if ! ps aux | grep -v grep | grep "lt --port $PORT" > /dev/null; then
        echo "⚠️  Túnel não está rodando. Reiniciando..."
        
        # Matar processos antigos
        pkill -f "lt --port" 2>/dev/null
        
        # Aguardar um pouco
        sleep 2
        
        # Iniciar novo túnel
        nohup lt --port $PORT --subdomain $SUBDOMAIN > $LOG_FILE 2>&1 &
        
        # Aguardar inicialização
        sleep 5
        
        # Mostrar URL
        if [ -f $LOG_FILE ]; then
            echo "✅ Túnel reiniciado!"
            cat $LOG_FILE
            echo ""
            echo "⚠️  IMPORTANTE: Você precisa RE-VALIDAR o webhook no Meta for Developers!"
            echo "   Vá para: Meta for Developers → Seu App → WhatsApp → Configuração → Webhook"
            echo "   Clique em 'Editar' e depois 'Verificar e Salvar'"
        fi
    else
        echo "✅ Túnel está ativo ($(date '+%H:%M:%S'))"
    fi
    
    # Aguardar 30 segundos antes da próxima verificação
    sleep 30
done
