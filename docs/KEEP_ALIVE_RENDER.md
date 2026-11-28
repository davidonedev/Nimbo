# Manter o backend acordado no Render (plano gratuito)

## Por que isso importa

O Render gratuito põe o serviço para dormir depois de ~15 min sem requisições. Dormindo, **nada roda**: nem a fila de avisos (a cada 15 s), nem os lembretes de 24 h e 2 h, nem a expiração de pedidos pendentes. Pior, a primeira pessoa que abre o link espera a subida inteira.

Medição em 2026-11-24, com o serviço dormindo: a 1ª chamada ao `/health` levou **107 s**; a seguinte, 0,33 s.

## Solução: um "toque" externo a cada 5 minutos

O serviço não consegue se acordar sozinho, então o toque vem de fora. Os endereços de saúde são públicos e ficam fora do limite de requisições (`HealthController.java`), então é seguro bater neles toda hora. O `/health` não usa o banco. O **`/health/deep`** também consulta o banco: devolve `200` quando está tudo bem e `503` quando o banco não responde. Por isso ele é o endereço certo para o monitor: passa a **avisar quando o banco cair ou pausar** e ainda mantém o banco do Supabase ativo.

### Opção recomendada: UptimeRobot (grátis, e ainda avisa se cair)

1. Criar conta em uptimerobot.com (plano gratuito).
2. **Add New Monitor** → tipo **HTTP(s)**.
3. URL: `https://nimbo-api-duyl.onrender.com/health/deep` (a URL do backend em produção, a mesma de `VITE_API_URL` sem o `/api`).
4. Intervalo: **5 minutos** (mínimo do plano gratuito).
5. Em **Alert Contacts**, marcar o seu e-mail: você passa a ser avisado se o backend cair (isso também cobre o item de monitoramento).

Alternativa equivalente: cron-job.org, com um job `GET` na mesma URL a cada 5 min.

### Por que não usar GitHub Actions

Funcionaria (`schedule` com `curl`), mas o agendamento do GitHub atrasa e pode ser pausado, e em repositório **privado** cada execução consome minutos do plano: 12 por hora passam do limite gratuito de 2.000 min/mês. Só vale se o repositório continuar público.

## Limites do plano gratuito [CONFIRMAR no painel do Render]

- O plano gratuito dá cerca de 750 horas de instância por mês. Um serviço ligado o mês inteiro usa ~744 h, então cabe **um** serviço gratuito sempre acordado por conta. Se houver mais de um serviço web gratuito no mesmo workspace, o total passa de 750 h e o Render suspende até virar o mês.
- Mesmo acordado, o Render reinicia o serviço de tempos em tempos (deploys, manutenção). A fila de avisos guarda tudo no banco, então o que ficou pendente sai quando ele volta.

## Como saber se está funcionando

- No UptimeRobot, o monitor deve mostrar **Up** e tempo de resposta abaixo de 1 s.
- Em Render → Logs, aparece uma linha de requisição a cada 5 min.
- Teste de ponta a ponta: confirme um agendamento que comece daqui a ~2 h e confira se o lembrete chega, sem ninguém ter aberto o site.

## Rede de segurança no frontend

Se mesmo assim o serviço dormir, depois de 6 s sem resposta a tela mostra "Estamos acordando o servidor" e o frontend espera até **150 s** pela resposta (`REQUEST_TIMEOUT_MS`, `frontend/src/lib/api.ts`) e repete em 502/503/504, para a primeira visita não falhar antes de a subida terminar.
