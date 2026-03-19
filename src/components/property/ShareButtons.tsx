"use client";

import { useState } from "react";

export default function ShareButtons({ url }: { url:string }) {

const [copied,setCopied] = useState(false);

function copyLink(){

navigator.clipboard.writeText(url);

setCopied(true);

setTimeout(()=>setCopied(false),2000);

}

return(

<div className="flex gap-3 text-sm pt-2 relative">

<a
href={`https://wa.me/?text=${url}`}
target="_blank"
className="chip"
>
WhatsApp
</a>

<a
href={`https://www.facebook.com/sharer/sharer.php?u=${url}`}
target="_blank"
className="chip"
>
Facebook
</a>

<button
className="chip"
onClick={copyLink}
>
Copy Link
</button>

{copied && (

<div className="absolute -bottom-8 left-0 text-xs bg-black text-white px-2 py-1 rounded">
Link copied ✓
</div>

)}

</div>

);

}