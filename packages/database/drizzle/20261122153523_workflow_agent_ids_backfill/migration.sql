-- One-time snapshot of getWorkflowAgentIds: agent nodes give agentId, team nodes give leadAgentId and every member agentId. From here on, publishing writes the column.
UPDATE "workflows" AS w
SET "agent_ids" = COALESCE((
  SELECT array_agg(DISTINCT refs."agent_id")
  FROM (
    SELECT n."node" #>> '{data,config,agentId}' AS "agent_id"
    FROM jsonb_array_elements(w."published_definition" -> 'nodes') AS n("node")
    WHERE n."node" ->> 'type' = 'agent'
    UNION ALL
    SELECT n."node" #>> '{data,config,leadAgentId}'
    FROM jsonb_array_elements(w."published_definition" -> 'nodes') AS n("node")
    WHERE n."node" ->> 'type' = 'team'
    UNION ALL
    SELECT m."member" ->> 'agentId'
    FROM jsonb_array_elements(w."published_definition" -> 'nodes') AS n("node")
    CROSS JOIN LATERAL jsonb_array_elements(n."node" #> '{data,config,members}') AS m("member")
    WHERE n."node" ->> 'type' = 'team'
  ) AS refs
  WHERE refs."agent_id" IS NOT NULL
), '{}')
WHERE w."published_definition" IS NOT NULL;
