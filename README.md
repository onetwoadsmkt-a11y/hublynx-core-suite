# Hublynx Core Suite

Crie uma aplicação SaaS moderna chamada Hublynx Core.

A plataforma deve funcionar como um sistema operacional para pequenas empresas, freelancers, agências e prestadores de serviço.

O design deve seguir o conceito:

Minimalista

Premium

Clean

Fundo branco

Estilo semelhante ao Linear, Notion, ClickUp, Monday e Stripe

Bordas arredondadas

Sombras suaves

Interface extremamente rápida

Responsiva para Desktop, Tablet e Mobile

Utilizar as cores da marca Hublynx:

Azul Escuro #071A3D

Azul #2563EB

Verde #00D084

Cinza Claro #F8FAFC

Branco #FFFFFF

⸻

STACK

Utilizar:

React

Typescript

Tailwind

Shadcn UI

Supabase

React Query

React Router

Recharts

Preparar estrutura escalável para futuros módulos.

⸻

AUTENTICAÇÃO

Criar sistema completo de login.

Campos:

E-mail

Senha

Recuperação de senha.

Persistência de sessão.

Perfis:

Administrador

Usuário

⸻

LAYOUT PRINCIPAL

Sidebar fixa à esquerda.

Menu:

Dashboard

Tarefas

Projetos

Clientes

Financeiro

Agenda

Arquivos

Relatórios

Configurações

⸻

Header superior:

Pesquisa global

Notificações

Perfil do usuário

⸻

DASHBOARD

Criar dashboard executivo.

Cards:

Tarefas

Pendentes

Em atraso

Concluídas

⸻

Projetos

Ativos

Em atraso

Concluídos

⸻

Financeiro

Receber esta semana

Pagar esta semana

Saldo previsto

⸻

Clientes

Ativos

Prospectos

Inadimplentes

⸻

Criar seção:

Tarefas do Dia

Exibir:

Tarefa

Projeto

Cliente

Prioridade

Horário

⸻

Criar seção:

Projetos em Andamento

Mostrar progresso em %

Barra visual.

⸻

Criar seção:

Próximos Eventos

Exibir:

Data

Horário

Tipo

Cliente

⸻

MÓDULO TAREFAS

Criar sistema completo de gestão de tarefas.

Campos:

Título

Descrição

Cliente

Projeto

Prioridade

Status

Data Início

Prazo

Responsável

Checklist

Anexos

Comentários

⸻

Prioridades:

Baixa

Média

Alta

Crítica

⸻

Status:

Backlog

Planejado

Em andamento

Aguardando Cliente

Revisão

Concluído

Cancelado

⸻

Visualizações:

Kanban

Lista

Calendário

⸻

Drag and Drop entre colunas.

⸻

MÓDULO PROJETOS

Criar gerenciamento de projetos.

Campos:

Nome

Cliente

Descrição

Data início

Prazo

Valor

Status

⸻

Status:

Planejamento

Em andamento

Aguardando

Concluído

Cancelado

⸻

Cada projeto deve possuir:

Tarefas

Arquivos

Comentários

Histórico

⸻

Exibir percentual de progresso automático.

⸻

MÓDULO CLIENTES

Cadastro completo.

Campos:

Nome

Empresa

E-mail

Telefone

WhatsApp

Instagram

Website

Endereço

⸻

Contrato:

Serviço

Valor mensal

Data início

Renovação

⸻

Exibir:

Projetos ativos

Faturamento total

Histórico

⸻

MÓDULO FINANCEIRO

Criar módulo financeiro simplificado.

⸻

Contas a Receber

Campos:

Cliente

Serviço

Valor

Vencimento

Status

Forma de Pagamento

⸻

Status:

Pendente

Pago

Atrasado

⸻

Contas a Pagar

Campos:

Fornecedor

Categoria

Valor

Vencimento

Status

⸻

Categorias:

Receita:

Social Media

Tráfego Pago

Desenvolvimento

Consultoria

Despesa:

Ferramentas

Infraestrutura

Marketing

Operacional

⸻

Criar:

Fluxo de Caixa

Filtros:

Hoje

7 dias

30 dias

90 dias

⸻

Criar gráficos:

Entradas

Saídas

Saldo

⸻

MÓDULO AGENDA

Calendário completo.

Visualizações:

Dia

Semana

Mês

⸻

Eventos:

Reunião

Entrega

Call

Pagamento

Follow-up

⸻

MÓDULO ARQUIVOS

Gestão de arquivos.

Categorias:

Contratos

Propostas

Financeiro

Projetos

Artes

Vídeos

⸻

Upload:

PDF

DOCX

XLSX

PNG

JPG

⸻

RELATÓRIOS

Criar dashboard de indicadores.

Indicadores:

Receita mensal

Clientes ativos

Projetos ativos

Tarefas concluídas

Taxa de conclusão

⸻

BANCO DE DADOS SUPABASE

Criar tabelas:

users

clients

projects

tasks

task_comments

task_checklists

finances

finance_categories

events

files

notifications

settings

⸻

Criar relacionamento completo entre todas as tabelas.

⸻

EXPERIÊNCIA DO USUÁRIO

Objetivo principal:

Substituir:

Trello

Planilhas Financeiras

Agenda de Papel

Lista de Clientes

O sistema deve permitir que um empreendedor gerencie 100% da operação diária dentro do Hublynx Core.

⸻

ROADMAP V2 (NÃO DESENVOLVER AGORA)

Preparar arquitetura para:

CRM Comercial

Pipeline de Vendas

Integração Gmail

Integração WhatsApp

Integração Google Calendar

Integração Bancária

IA Assistente

Automações via Make

Webhooks

Multiempresa

Aplicativo Mobile

Criar toda a estrutura com padrão SaaS profissional, escalável e pronta para crescimento futuro.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://hublynx-core-suite.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/957e50d6-f832-4e70-8e2d-1731f6df103a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
