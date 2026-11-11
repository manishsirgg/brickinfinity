# Rental costs and listing availability

Apply `supabase/migrations/20261111_rental_costs_availability.sql` before deploying the app. It depends on `description_has_contact_details` from `20261110_block_description_contact_details.sql`. No existing fees or confirmation dates are backfilled. Existing listings remain discoverable with `unknown` availability until their owner/admin confirms them.

Add/edit forms collect refundable deposit, monthly maintenance, monthly parking, other monthly and one-time charges, charge notes and negotiability. Brokerage is not supported under the owner-only policy. The owner-only migration pauses legacy listings with nonzero brokerage until corrected and reviewed; estimates remain hidden for those legacy records. Blank means undisclosed; zero means no charge. Monthly/move-in calculations are shown only when a monthly rate is provided, and missing fees produce a clearly labeled known subtotal. The move-in estimate includes first-month rent, recurring extras, deposit and one-time charges; it is not a payment request.

Availability supports available now, available from a date, rented, sold, unavailable and unknown. Changing status/date records confirmation time. An authenticated owner/admin can reconfirm using the seller's My Listings action. The dashboard displays a reminder when confirmation is missing or 30 days old; no scheduled email/WhatsApp notification service or automatic expiry is introduced.

Closed listings are excluded from public browsing and the sitemap. Their detail URLs remain readable with an unavailable notice and disabled enquiries. Both enquiry creation and phone-reveal APIs reject closed listings. Search supports availability and confirmation within the last 30 days. Stale listings remain visible with a reconfirmation warning; age alone does not mark a property rented/sold.

Validation: `node scripts/validate-rental-availability.mjs --database`, `node scripts/validate-property-location.mjs`, `node scripts/validate-property-views.mjs`, TypeScript, ESLint and simulated-backend Chromium edit/reconfirmation checks. Production schema/data were not changed by these checks.
