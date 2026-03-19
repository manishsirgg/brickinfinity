"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

export default function AdminLogsPage() {

  const [logs, setLogs] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  /* ================= FETCH LOGS ================= */

  async function fetchLogs() {

    setLoading(true)

    try {

      const { data } = await supabase.auth.getUser()

      if (!data?.user) {
        alert("Session expired. Please login again.")
        setLoading(false)
        return
      }

      const { data: logsData, error } = await supabase
        .from("moderation_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200)

      if (error) {
        console.error("Logs fetch error:", error)
        setLoading(false)
        return
      }

      setLogs(logsData || [])

    } catch (err) {
      console.error("Unexpected logs error:", err)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  /* ================= TIME FORMATTER ================= */

  function relativeTime(dateStr: string) {

    if (!dateStr) return "—"

    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000

    if (diff < 60) return "Just now"
    if (diff < 3600) return Math.floor(diff / 60) + " min ago"
    if (diff < 86400) return Math.floor(diff / 3600) + " hrs ago"

    return new Date(dateStr).toLocaleDateString()
  }

  /* ================= UI ================= */

  return (

    <div className="max-w-7xl mx-auto p-10">

      <h1 className="text-2xl font-semibold mb-8">
        Moderation Logs
      </h1>

      <div className="grid grid-cols-3 gap-6">

        {/* LOG LIST */}

        <div className="border rounded-xl p-4">

          <h2 className="font-semibold mb-4">
            Recent Actions
          </h2>

          {loading && (
            <p className="text-sm text-gray-500">
              Loading logs...
            </p>
          )}

          {!loading && logs.length === 0 && (
            <p className="text-gray-500 text-sm">
              No logs available
            </p>
          )}

          <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">

            {logs.map(log => (

              <div
                key={log.id}
                onClick={() => setSelected(log)}
                className={`border rounded-md p-3 cursor-pointer hover:bg-gray-100 ${
                  selected?.id === log.id ? "bg-gray-100" : ""
                }`}
              >

                <div className="font-medium text-sm capitalize">
                  {(log.action || "unknown").replaceAll("_", " ")}
                </div>

                <div className="text-xs text-gray-500 capitalize">
                  {log.entity_type || "—"}
                </div>

                <div className="text-xs text-gray-400">
                  {relativeTime(log.created_at)}
                </div>

              </div>

            ))}

          </div>

        </div>

        {/* LOG DETAILS */}

        <div className="col-span-2 border rounded-xl p-6">

          {!selected && (
            <p className="text-gray-500">
              Select a log entry
            </p>
          )}

          {selected && (

            <div>

              <div className="text-lg font-semibold mb-4 capitalize">
                {(selected.action || "unknown").replaceAll("_"," ")}
              </div>

              <div className="mb-2 text-sm">
                <strong>Entity Type:</strong> {selected.entity_type || "—"}
              </div>

              <div className="mb-2 text-sm break-all">
                <strong>Entity ID:</strong> {selected.entity_id || "—"}
              </div>

              <div className="mb-2 text-sm break-all">
                <strong>Admin ID:</strong> {selected.admin_id || "—"}
              </div>

              <div className="mb-4 text-sm">
                <strong>Timestamp:</strong>{" "}
                {selected.created_at
                  ? new Date(selected.created_at).toLocaleString()
                  : "—"}
              </div>

              <div className="text-sm">
                <strong>Reason:</strong>
                <div className="mt-1 text-gray-700">
                  {selected.reason || "No reason recorded"}
                </div>
              </div>

            </div>

          )}

        </div>

      </div>

    </div>

  )
}