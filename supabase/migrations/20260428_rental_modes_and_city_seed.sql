-- Add flexible rental pricing to support hourly/daily/monthly rentals.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS rent_frequency text[] NULL,
  ADD COLUMN IF NOT EXISTS hourly_rate numeric NULL,
  ADD COLUMN IF NOT EXISTS daily_rate numeric NULL,
  ADD COLUMN IF NOT EXISTS monthly_rate numeric NULL;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_rental_rate_non_negative_chk
  CHECK (
    (hourly_rate IS NULL OR hourly_rate >= 0)
    AND (daily_rate IS NULL OR daily_rate >= 0)
    AND (monthly_rate IS NULL OR monthly_rate >= 0)
  );

CREATE INDEX IF NOT EXISTS idx_properties_listing_status_city
  ON public.properties (listing_type, status, city_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_properties_title_search
  ON public.properties USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')));

-- Expand city master data (major and high-demand Indian cities across all states/UTs).
WITH city_seed(state_name, city_name) AS (
  VALUES
    ('Andhra Pradesh','Visakhapatnam'),('Andhra Pradesh','Vijayawada'),('Andhra Pradesh','Guntur'),('Andhra Pradesh','Tirupati'),('Andhra Pradesh','Kurnool'),
    ('Arunachal Pradesh','Itanagar'),('Arunachal Pradesh','Naharlagun'),('Arunachal Pradesh','Tawang'),
    ('Assam','Guwahati'),('Assam','Dibrugarh'),('Assam','Silchar'),('Assam','Jorhat'),('Assam','Tezpur'),
    ('Bihar','Patna'),('Bihar','Gaya'),('Bihar','Muzaffarpur'),('Bihar','Bhagalpur'),('Bihar','Darbhanga'),
    ('Chhattisgarh','Raipur'),('Chhattisgarh','Bhilai'),('Chhattisgarh','Bilaspur'),('Chhattisgarh','Korba'),
    ('Goa','Panaji'),('Goa','Margao'),('Goa','Vasco da Gama'),('Goa','Mapusa'),
    ('Gujarat','Ahmedabad'),('Gujarat','Surat'),('Gujarat','Vadodara'),('Gujarat','Rajkot'),('Gujarat','Gandhinagar'),('Gujarat','Bhavnagar'),
    ('Haryana','Gurugram'),('Haryana','Faridabad'),('Haryana','Panipat'),('Haryana','Ambala'),('Haryana','Hisar'),('Haryana','Karnal'),
    ('Himachal Pradesh','Shimla'),('Himachal Pradesh','Dharamshala'),('Himachal Pradesh','Solan'),('Himachal Pradesh','Mandi'),
    ('Jharkhand','Ranchi'),('Jharkhand','Jamshedpur'),('Jharkhand','Dhanbad'),('Jharkhand','Bokaro'),('Jharkhand','Deoghar'),
    ('Karnataka','Bengaluru'),('Karnataka','Mysuru'),('Karnataka','Mangaluru'),('Karnataka','Hubballi'),('Karnataka','Belagavi'),('Karnataka','Ballari'),
    ('Kerala','Thiruvananthapuram'),('Kerala','Kochi'),('Kerala','Kozhikode'),('Kerala','Thrissur'),('Kerala','Kannur'),('Kerala','Kollam'),
    ('Madhya Pradesh','Bhopal'),('Madhya Pradesh','Indore'),('Madhya Pradesh','Jabalpur'),('Madhya Pradesh','Gwalior'),('Madhya Pradesh','Ujjain'),('Madhya Pradesh','Sagar'),
    ('Maharashtra','Mumbai'),('Maharashtra','Pune'),('Maharashtra','Nagpur'),('Maharashtra','Nashik'),('Maharashtra','Thane'),('Maharashtra','Aurangabad'),('Maharashtra','Kolhapur'),
    ('Manipur','Imphal'),('Manipur','Thoubal'),
    ('Meghalaya','Shillong'),('Meghalaya','Tura'),
    ('Mizoram','Aizawl'),('Mizoram','Lunglei'),
    ('Nagaland','Kohima'),('Nagaland','Dimapur'),('Nagaland','Mokokchung'),
    ('Odisha','Bhubaneswar'),('Odisha','Cuttack'),('Odisha','Rourkela'),('Odisha','Sambalpur'),('Odisha','Berhampur'),
    ('Punjab','Ludhiana'),('Punjab','Amritsar'),('Punjab','Jalandhar'),('Punjab','Patiala'),('Punjab','Bathinda'),
    ('Rajasthan','Jaipur'),('Rajasthan','Jodhpur'),('Rajasthan','Udaipur'),('Rajasthan','Kota'),('Rajasthan','Ajmer'),('Rajasthan','Bikaner'),
    ('Sikkim','Gangtok'),('Sikkim','Namchi'),
    ('Tamil Nadu','Chennai'),('Tamil Nadu','Coimbatore'),('Tamil Nadu','Madurai'),('Tamil Nadu','Tiruchirappalli'),('Tamil Nadu','Salem'),('Tamil Nadu','Tirunelveli'),
    ('Telangana','Hyderabad'),('Telangana','Warangal'),('Telangana','Nizamabad'),('Telangana','Karimnagar'),('Telangana','Khammam'),
    ('Tripura','Agartala'),('Tripura','Udaipur'),
    ('Uttar Pradesh','Lucknow'),('Uttar Pradesh','Kanpur'),('Uttar Pradesh','Noida'),('Uttar Pradesh','Ghaziabad'),('Uttar Pradesh','Varanasi'),('Uttar Pradesh','Agra'),('Uttar Pradesh','Prayagraj'),('Uttar Pradesh','Gorakhpur'),('Uttar Pradesh','Meerut'),
    ('Uttarakhand','Dehradun'),('Uttarakhand','Haridwar'),('Uttarakhand','Haldwani'),('Uttarakhand','Roorkee'),
    ('West Bengal','Kolkata'),('West Bengal','Howrah'),('West Bengal','Siliguri'),('West Bengal','Durgapur'),('West Bengal','Asansol'),
    ('Andaman and Nicobar Islands','Port Blair'),
    ('Chandigarh','Chandigarh'),
    ('Dadra and Nagar Haveli and Daman and Diu','Daman'),('Dadra and Nagar Haveli and Daman and Diu','Silvassa'),
    ('Delhi','New Delhi'),('Delhi','Delhi'),
    ('Jammu and Kashmir','Srinagar'),('Jammu and Kashmir','Jammu'),('Jammu and Kashmir','Anantnag'),
    ('Ladakh','Leh'),('Ladakh','Kargil'),
    ('Lakshadweep','Kavaratti'),
    ('Puducherry','Puducherry'),('Puducherry','Karaikal')
), matched_states AS (
  SELECT s.id AS state_id, c.city_name
  FROM city_seed c
  JOIN public.states s ON lower(s.name) = lower(c.state_name)
)
INSERT INTO public.cities (state_id, name)
SELECT ms.state_id, ms.city_name
FROM matched_states ms
LEFT JOIN public.cities existing
  ON existing.state_id = ms.state_id
 AND lower(existing.name) = lower(ms.city_name)
WHERE existing.id IS NULL;
