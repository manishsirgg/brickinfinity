import { NextResponse } from "next/server"

export async function POST(req:Request){

const {imageUrl} = await req.json()

/*
Later we plug real moderation APIs here
For now basic placeholder
*/

const flags:string[] = []

if(imageUrl.includes("porn") || imageUrl.includes("adult")){
flags.push("adult_content")
}

return NextResponse.json({

safe:flags.length===0,
flags

})

}