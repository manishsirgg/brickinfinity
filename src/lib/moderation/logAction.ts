import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

export async function logAction(
  adminId: string,
  entityType: string,
  entityId: string,
  action: string,
  reason?: string
) {

  const { error } = await supabase
    .from("moderation_logs")
    .insert({
      admin_id: adminId,
      entity_type: entityType,
      entity_id: entityId,
      action: action,
      reason: reason || null
    })

  if (error) {
    console.error("Moderation log error:", error)
  }

}