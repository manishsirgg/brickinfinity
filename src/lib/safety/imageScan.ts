export async function scanImageSafety(imageUrl:string){

try{

const res = await fetch("/api/moderation/image",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({imageUrl})
})

const data = await res.json()

return data

}catch(err){

console.error("Image scan failed",err)

return {
safe:true,
flags:[]
}

}

}