// 史跡として扱う historic=* の値(道路・距離標などは除外)
const HISTORIC = ['yes', 'memorial', 'monument', 'wayside_shrine', 'ruins', 'archaeological_site', 'tomb', 'castle', 'fort', 'manor', 'building', 'heritage', 'city_gate', 'shrine', 'temple', 'battlefield'];

export const POI_TYPES = [
  { key: 'convenience', label: 'コンビニ', q: '["shop"="convenience"]', match: { shop: 'convenience' }, color: '#ffd400' },
  { key: 'fuel', label: 'ガソリンスタンド', q: '["amenity"="fuel"]', match: { amenity: 'fuel' }, color: '#ff5a36' },
  { key: 'restaurant', label: '飲食店', q: '["amenity"~"^(restaurant|fast_food|cafe)$"]', match: { amenity: ['restaurant', 'fast_food', 'cafe'] }, color: '#4ade80' },
  { key: 'parking', label: '駐車場', q: '["amenity"="parking"]', match: { amenity: 'parking' }, color: '#60a5fa' },
  { key: 'toilets', label: 'トイレ', q: '["amenity"="toilets"]', match: { amenity: 'toilets' }, color: '#c084fc' },
  { key: 'charging', label: '充電ステーション', q: '["amenity"="charging_station"]', match: { amenity: 'charging_station' }, color: '#22d3ee' },
  { key: 'supermarket', label: 'スーパー', q: '["shop"="supermarket"]', match: { shop: 'supermarket' }, color: '#f472b6' },
  { key: 'hospital', label: '病院', q: '["amenity"="hospital"]', match: { amenity: 'hospital' }, color: '#f87171' },
  { key: 'park', label: '公園', q: '["leisure"="park"]', match: { leisure: 'park' }, color: '#a3e635' },
  { key: 'worship', label: '神社仏閣', q: '["amenity"="place_of_worship"]', match: { amenity: 'place_of_worship' }, color: '#fb923c' },
  { key: 'historic', label: '史跡・歴史的な場所', q: `["historic"~"^(${HISTORIC.join('|')})$"]`, match: { historic: HISTORIC }, color: '#d4a373' },
];
