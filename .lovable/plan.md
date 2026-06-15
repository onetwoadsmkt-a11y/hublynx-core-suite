## Alterações em `src/components/projects/ProjectCommercialTable.tsx`

### 1. Filtro de período: mês atual (padrão)
- Adicionar filtro implícito por `due_date` dentro do mês corrente (1º dia até último dia do mês atual) aplicado sobre `items` antes do agrupamento.
- Manter os filtros existentes de Tipo e Periodicidade.
- (Opcional leve) Adicionar um pequeno seletor "Mês: <mês/ano atual>" apenas como rótulo informativo no cabeçalho, sem permitir trocar (escopo do pedido = mês atual). Pode ser só um `Badge` "Mês atual".

### 2. Agrupar a tabela por descrição
- Após filtragem, agrupar `filtered` por chave normalizada da `description` (trim + lowercase; vazio vira `"Sem descrição"`).
- Renderizar uma única `Table` com linhas-cabeçalho de grupo (colspan) seguidas das linhas do grupo:
  ```
  ▸ Mensalidade Cliente X            (3 itens · R$ 1.200,00)
      01/06 · Receita · Mensal · ... · R$ 400,00 · Pago · [👁] [✏] [🗑]
      08/06 · ...
  ▸ Hospedagem
      ...
  ```
- Cada grupo mostra: nome da descrição + contagem + soma do grupo (receita ou despesa, com cor).
- Manter colunas atuais (Data, Tipo, Periodicidade, Descrição, Valor, Status, Ações).

### 3. Ícone de visualização detalhada (por linha)
- Adicionar um botão `Eye` (lucide-react) na coluna Ações, antes do `Pencil`.
- Ao clicar, abre um novo `Dialog` (`EntryDetailsDialog`) com **resumo completo do lançamento**:
  - Tipo (Receita/Despesa) — Badge colorido
  - Descrição
  - Valor (formatado BRL)
  - Data de vencimento
  - Data de pagamento (`paid_at`) ou "—"
  - Status (Pendente/Pago/Atrasado) — Badge
  - Periodicidade (Diária/Mensal) + recorrência
  - Método de pagamento
  - Parcela (`installment_no / installment_total`) quando existir
  - IDs vinculados: projeto, cliente, categoria (somente o que já está em `Entry`/retorno do `listProjectFinances`; sem novas queries)
- Footer com botão "Fechar" e "Editar" (que fecha o modal de detalhes e abre o `EntryDialog` existente em modo edição).

### 4. Estado novo
- `const [detailsOpen, setDetailsOpen] = useState(false)`
- `const [detailsEntry, setDetailsEntry] = useState<Entry | null>(null)`
- Componente local `EntryDetailsDialog({ open, onOpenChange, entry, onEdit })`.

## Sem alterações
- Schema do banco, server functions (`listProjectFinances`, etc.) e demais arquivos permanecem inalterados — toda a mudança é de UI/apresentação dentro do componente.
