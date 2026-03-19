"use client"

export default function ModerationQueue({
items,
selected,
setSelected
}:any){

return (

<div className="space-y-2">

<h3 className="font-semibold text-sm">
Moderation Queue
</h3>

{items.map((item:any)=>(
<div
key={item.id}
onClick={()=>setSelected(item)}
className={`cursor-pointer border rounded p-3 text-sm transition
${selected?.id===item.id ? "border-primary bg-blue-50":"hover:bg-gray-50"}
`}
>

<p className="font-medium truncate">
{item.title || "Document"}
</p>

<p className="text-xs text-muted">
₹ {item.price || ""}
</p>

</div>
))}

</div>

)

}