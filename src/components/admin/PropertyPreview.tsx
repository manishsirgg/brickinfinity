"use client"

export default function PropertyPreview({property}:any){

if(!property){
return <div className="text-sm text-muted">Select item</div>
}

return(

<div className="space-y-4">

<h2 className="text-xl font-semibold">
{property.title}
</h2>

<p className="text-muted">
₹ {property.price}
</p>

{/* IMAGES */}

<div className="grid grid-cols-3 gap-2">

{property.property_images?.map((img:any,i:number)=>(
<img
key={i}
src={img.image_url}
className="rounded border h-28 w-full object-cover"
/>
))}

</div>

{/* VIDEO */}

{property.property_videos?.[0]?.video_url && (

<video
controls
className="w-full rounded border mt-3"
src={property.property_videos[0].video_url}
/>

)}

{/* OWNERSHIP DOC */}

{property.documents?.[0]?.document_url && (

<iframe
src={property.documents[0].document_url}
className="w-full h-72 border rounded"
/>

)}

</div>

)

}