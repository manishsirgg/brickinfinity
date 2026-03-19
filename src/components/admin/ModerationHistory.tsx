"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

export default function ModerationHistory({
  entityId,
}: {
  entityId: string | null
}) {

const [logs,setLogs] = useState<any[]>([])

async function fetchLogs(){

const {data} = await supabase
.from("moderation_logs")
.select(`
*,
users(full_name)
`)
.eq("entity_id",entityId)
.order("created_at",{ascending:false})

setLogs(data || [])

}

useEffect(()=>{
if(entityId) fetchLogs()
},[entityId])

if(!logs.length){
return <p className="text-sm text-muted">No moderation history</p>
}

return(

<div className="space-y-3">

<h3 className="font-semibold text-sm">
Moderation History
</h3>

{logs.map((log:any)=>(
<div
key={log.id}
className="border rounded p-3 text-sm bg-gray-50"
>

<p>
<strong>{log.users?.full_name}</strong>
</p>

<p className="text-xs text-muted">
Action: {log.action}
</p>

{log.reason && (
<p className="text-xs text-red-600">
Reason: {log.reason}
</p>
)}

<p className="text-xs text-muted">
{new Date(log.created_at).toLocaleString()}
</p>

</div>
))}

</div>

)

}