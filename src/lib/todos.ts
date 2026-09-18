import { sql } from "@/lib/db";
import {
  formatAssigneeNames,
  type TodoAssignee,
} from "@/lib/todo-assignees";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseAssignees(value: unknown): TodoAssignee[] {
  const raw =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return [];
          }
        })()
      : value;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string") return [];
    return [
      {
        id: row.id,
        name: row.name,
        email: typeof row.email === "string" ? row.email : undefined,
        avatar_url:
          typeof row.avatar_url === "string" ? row.avatar_url : null,
      },
    ];
  });
}

export function decorateTodo<T extends Record<string, unknown>>(row: T) {
  let assignees = parseAssignees(row.assignees);
  if (
    assignees.length === 0 &&
    typeof row.assignee_id === "string" &&
    typeof row.assignee_name === "string"
  ) {
    assignees = [
      {
        id: row.assignee_id,
        name: row.assignee_name,
        email: typeof row.assignee_email === "string" ? row.assignee_email : undefined,
      },
    ];
  }

  const names = formatAssigneeNames(assignees);
  const primary =
    assignees.find((a) => a.id === row.assignee_id) ?? assignees[0] ?? null;

  return {
    ...row,
    assignees,
    assignee_ids: assignees.map((a) => a.id),
    assignee_id: primary?.id ?? row.assignee_id ?? null,
    assignee_name: names || row.assignee_name || null,
  };
}

export async function resolveAssigneeIds(input: unknown): Promise<string[]> {
  if (!Array.isArray(input)) return [];
  const unique = [
    ...new Set(
      input.filter(
        (id): id is string => typeof id === "string" && UUID_RE.test(id),
      ),
    ),
  ];
  if (unique.length === 0) return [];

  const csv = unique.join(",");
  const { rows } = await sql`
    SELECT id FROM users WHERE id = ANY(string_to_array(${csv}, ',')::uuid[])
  `;
  const allowed = new Set(rows.map((r) => r.id as string));
  return unique.filter((id) => allowed.has(id));
}

export async function replaceTodoAssignees(todoId: string, userIds: string[]) {
  await sql`DELETE FROM todo_assignees WHERE todo_id = ${todoId}`;
  if (userIds.length > 0) {
    const csv = userIds.join(",");
    await sql`
      INSERT INTO todo_assignees (todo_id, user_id)
      SELECT ${todoId}::uuid, unnest(string_to_array(${csv}, ',')::uuid[])
    `;
  }
  await sql`
    UPDATE todos SET assignee_id = ${userIds[0] ?? null} WHERE id = ${todoId}
  `;
}

export async function fetchTodo(id: string) {
  const { rows } = await sql`
    SELECT
      t.*,
      u.name AS assignee_name, u.email AS assignee_email,
      c.name AS company_name, c.logo_url AS company_logo_url,
      p.name AS project_name,
      pc.name AS project_company_name, pc.logo_url AS project_company_logo_url,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', au.id,
              'name', au.name,
              'email', au.email,
              'avatar_url', au.avatar_url
            )
            ORDER BY au.name
          )
          FROM todo_assignees ta
          JOIN users au ON au.id = ta.user_id
          WHERE ta.todo_id = t.id
        ),
        '[]'::json
      ) AS assignees
    FROM todos t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN companies pc ON pc.id = p.company_id
    WHERE t.id = ${id}
  `;
  return rows[0] ? decorateTodo(rows[0] as Record<string, unknown>) : null;
}

export async function listTodos(filters: {
  assignee: string | null;
  status: string | null;
  company: string | null;
}) {
  const { assignee, status, company } = filters;
  const { rows } = await sql`
    SELECT
      t.*,
      u.name AS assignee_name, u.email AS assignee_email,
      c.name AS company_name, c.logo_url AS company_logo_url,
      p.name AS project_name,
      pc.name AS project_company_name, pc.logo_url AS project_company_logo_url,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', au.id,
              'name', au.name,
              'email', au.email,
              'avatar_url', au.avatar_url
            )
            ORDER BY au.name
          )
          FROM todo_assignees ta
          JOIN users au ON au.id = ta.user_id
          WHERE ta.todo_id = t.id
        ),
        '[]'::json
      ) AS assignees
    FROM todos t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN companies pc ON pc.id = p.company_id
    WHERE
      (
        COALESCE(${assignee}, '') = ''
        OR t.assignee_id::text = ${assignee}
        OR EXISTS (
          SELECT 1 FROM todo_assignees ta
          WHERE ta.todo_id = t.id AND ta.user_id::text = ${assignee}
        )
      )
      AND (COALESCE(${status}, '') = '' OR t.status = ${status})
      AND (COALESCE(${company}, '') = '' OR t.company_id::text = ${company})
    ORDER BY
      CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      t.due_date ASC NULLS LAST,
      t.created_at DESC
  `;
  return rows.map((row) => decorateTodo(row as Record<string, unknown>));
}
