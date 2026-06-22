// netlify/functions/prices.js
// Fetches live grocery prices from Talabat UAE (Westzone partner store)

const FALLBACK = {
  "potatoes":2.5,"onion":2,"tomato":4,"brinjal":5.5,"cauliflower":5,
  "spinach":4,"okra":7,"capsicum":10,"green peas":8,"french beans":8.5,
  "bitter gourd":10,"bottle gourd":5,"taro root":7,"radish":4,"turnip":5,
  "round gourd":7,"ridge gourd":6,"mushrooms":12,"coriander":1.5,"mint":1.5,
  "lemon":1.5,"mixed vegetables":8,"wheat flour":3,"basmati rice":12,"rice":6,
  "maida":6.5,"semolina":8,"flattened rice":10,"vermicelli":8,"moong dal":17,
  "toor dal":15,"urad dal":18,"chana dal":15,"yellow dal":17,"rajma":15,
  "chickpeas":10,"black chickpeas":12,"lobia":12,"bread":7,"burger buns":7,
  "pav buns":6,"kulcha":8,"gram flour":15,"noodles":15,"milk":6,"yogurt":11,
  "paneer":24,"butter":10,"ghee":15,"fresh cream":10,"cheese":15,"eggs":9,
  "chicken":22,"cooking oil":16,"soy sauce":6,"peanuts":6,"cashews":30,
  "soya chunks":9,"sugar":4,"mixed dals":17
};

// Talabat UAE search — Westzone is vendor ID 379 in Dubai
const TALABAT_SEARCH = "https://api.talabat.com/v2/delivery/grocery/products/search";
const TALABAT_HEADERS = {
  "Accept": "application/json",
  "Accept-Language": "en",
  "User-Agent": "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36",
  "client": "web",
  "countryId": "4",
  "languageId": "2",
  "x-app-platform": "web"
};

async function fetchTalabatPrice(item) {
  try {
    const url = `${TALABAT_SEARCH}?q=${encodeURIComponent(item)}&vendorId=379&pageSize=3`;
    const res = await fetch(url, { headers: TALABAT_HEADERS, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    const products = data?.products || data?.items || data?.data || [];
    if (!products.length) return null;
    // Find best match by name similarity
    const match = products.find(p => {
      const name = (p.name || p.title || "").toLowerCase();
      const q = item.toLowerCase();
      return name.includes(q.split(" ")[0]) || q.includes(name.split(" ")[0]);
    }) || products[0];
    const price = match?.price?.amount || match?.price || match?.unitPrice;
    return price ? parseFloat(price) : null;
  } catch(e) {
    return null;
  }
}

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  let items = [];
  try {
    items = JSON.parse(event.body || "{}").items || [];
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({error: "Bad request"}) };
  }

  const results = {};
  const toFetch = items.slice(0, 20); // cap at 20 to stay fast

  // Fetch in batches of 4 to avoid overwhelming Talabat
  for (let i = 0; i < toFetch.length; i += 4) {
    const batch = toFetch.slice(i, i + 4);
    const prices = await Promise.all(batch.map(item => fetchTalabatPrice(item)));
    batch.forEach((item, idx) => {
      const itemLower = item.toLowerCase();
      if (prices[idx] !== null && prices[idx] !== undefined) {
        results[itemLower] = Math.round(prices[idx] * 10) / 10;
      } else {
        // Use fallback for this item
        const fallbackKey = Object.keys(FALLBACK).find(k => itemLower.includes(k) || k.includes(itemLower.split(" ")[0]));
        if (fallbackKey) results[itemLower] = FALLBACK[fallbackKey];
      }
    });
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(results)
  };
};
