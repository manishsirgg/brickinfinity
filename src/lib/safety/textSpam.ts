export function detectSpam(text:string){

const spamWords = [
"loan",
"crypto",
"escort",
"casino"
]

const lower = text.toLowerCase()

return spamWords.some(word => lower.includes(word))

}