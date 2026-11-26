/**
 * Cancela (status "cancelado") as tarefas abertas de um projeto — pelo project_id ou pelas
 * etapas dele. Usado antes de excluir o projeto: tasks.project_id/stage_id são ON DELETE
 * SET NULL, e sem isso as tarefas ficariam soltas na Agenda.
 */
export async function cancelOpenProjectTasks(db: any, projectId: string): Promise<void> {
  const { data: stages } = await db.from("project_stages").select("id").eq("project_id", projectId);
  const stageIds = ((stages ?? []) as Array<{ id: string }>).map((s) => s.id);
  const filter = stageIds.length
    ? `project_id.eq.${projectId},stage_id.in.(${stageIds.join(",")})`
    : `project_id.eq.${projectId}`;
  const { error } = await db
    .from("tasks")
    .update({ status: "cancelado" })
    .or(filter)
    .not("status", "in", "(concluido,cancelado)");
  if (error) throw new Error(`Não foi possível encerrar as tarefas do projeto: ${error.message}`);
}
