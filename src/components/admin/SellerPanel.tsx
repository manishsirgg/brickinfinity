"use client"

export default function SellerPanel({seller,properties}:any){

if(!seller){
return <p className="text-sm text-muted">Seller info</p>
}

const accountAge =
Math.floor(
(Date.now() - new Date(seller.created_at).getTime())
/ (1000*60*60*24)
)

return(

<div className="space-y-3">

<h3 className="font-semibold text-sm">
Seller Profile
</h3>

<p><strong>{seller.full_name}</strong></p>

<p className="text-xs text-muted">
Account age: {accountAge} days
</p>

<p className="text-xs text-muted">
KYC Status: {seller.kyc_status}
</p>

<p className="text-xs text-muted">
Listings: {properties?.length || 0}
</p>

</div>

)

}