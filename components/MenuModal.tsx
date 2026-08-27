/**
 * @module components/MenuModal
 * Dining menu browser with meal-period tabs, dietary filters,
 * date navigation, and live Sodexo API integration for Birch Tree Inn.
 */

'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAccessibleDialog } from '@/components/useAccessibleDialog';
import { MODAL_PANEL } from '@/components/modalShell';
import { anyObject, loadCampusData } from '@/lib/campus-data';
import {
  Apple,
  Bean,
  Beef,
  CalendarDays,
  Carrot,
  ChevronRight,
  Clock,
  Coffee,
  CookingPot,
  Croissant,
  CupSoda,
  Dessert,
  Drumstick,
  EggFried,
  Fish,
  Hamburger,
  Loader2,
  Milk,
  Moon,
  Pizza,
  Popcorn,
  Salad,
  Sandwich,
  Search,
  Soup,
  Sun,
  Sunrise,
  Utensils,
  X,
} from 'lucide-react';

interface MenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMeal?: string;
}

interface MenuItem {
  name: string;
  calories?: string;
  dietary?: string;
  description?: string;
}

interface Station {
  name: string;
  items: MenuItem[];
}

interface Meal {
  name: string;
  stations: Station[];
}

interface MenuApiResponse {
  content?: string | null;
  success?: boolean;
  available?: boolean;
  closed?: boolean;
  closureReason?: string;
  generatedUtc?: string | null;
  fileUpdatedUtc?: string | null;
}

// Hours Data Types
interface DiningHoursLocation {
  name: string;
  emoji: string;
  todayLabel: string;
  isOverride: boolean;
  overrideNote?: string;
  hours: { label?: string; time: string }[];
}

interface GeneralHoursSchedule {
  days: string;
  hours: { label?: string; time: string }[];
}

interface GeneralLocation {
  name: string;
  emoji: string;
  schedule: GeneralHoursSchedule[];
}

interface DiningHoursResponse {
  success?: boolean;
  today?: string;
  dateFormatted?: string;
  locations?: DiningHoursLocation[];
  generalHours?: GeneralLocation[];
}

const TRANSACT_BALANCE_URL = 'https://idx.transactcampus.com/accounts/ramapo-edu/id-card/home';

// Date utilities for the day selector
function getEstDate(offset = 0): Date {
  const now = new Date();
  const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  est.setDate(est.getDate() + offset);
  est.setHours(0, 0, 0, 0);
  return est;
}

function formatDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayLabel(d: Date, offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

function formatMenuDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

interface DayOption {
  label: string;
  dateParam: string;
  offset: number;
  date: Date;
}

// Helpers to parse the specific markdown format
function parseMenuMarkdown(markdown: string): Meal[] {
  const lines = markdown.split('\n');
  const meals: Meal[] = [];
  let currentMeal: Meal | null = null;
  let currentStation: Station | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Meal Header (## BREAKFAST)
    if (trimmed.startsWith('## ')) {
      if (currentStation && currentMeal) {
        currentMeal.stations.push(currentStation);
        currentStation = null;
      }
      if (currentMeal) {
        meals.push(currentMeal);
      }
      const mealName = trimmed.replace('## ', '').trim();
      currentMeal = { name: mealName, stations: [] };
    }
    // Station Header (### GRILL)
    else if (trimmed.startsWith('### ')) {
      if (currentStation && currentMeal) {
        currentMeal.stations.push(currentStation);
      }
      const stationName = trimmed.replace('### ', '').trim();
      currentStation = { name: stationName, items: [] };
    }
    // Item (- **Name** (cal) _[Dietary]_)
    else if (trimmed.startsWith('- ')) {
       if (!currentStation) continue;
       
       const nameMatch = trimmed.match(/\*\*(.*?)\*\*/);
       const name = nameMatch ? nameMatch[1] : trimmed.replace('- ', '');
       
       const calMatch = trimmed.match(/\((.*?cal)\)/);
       const calories = calMatch ? calMatch[1] : undefined;
       
       const dietMatch = trimmed.match(/_\[(.*?)\]_/);
       const dietary = dietMatch ? dietMatch[1] : undefined;

       currentStation.items.push({
         name,
         calories,
         dietary
       });
    }
    // Description (> Description)
    else if (trimmed.startsWith('> ')) {
       if (currentStation && currentStation.items.length > 0) {
         const lastItem = currentStation.items[currentStation.items.length - 1];
         lastItem.description = trimmed.replace('> ', '').trim();
       }
    }
  }

  // Push remaining context
  if (currentStation && currentMeal) {
    currentMeal.stations.push(currentStation);
  }
  if (currentMeal) {
    meals.push(currentMeal);
  }

  return meals;
}

function getMealIcon(mealName: string) {
  const name = mealName.toLowerCase();
  if (name.includes('breakfast')) return <Sunrise className="w-4 h-4" />;
  if (name.includes('lunch')) return <Sun className="w-4 h-4" />;
  if (name.includes('dinner')) return <Moon className="w-4 h-4" />;
  if (name.includes('late')) return <Coffee className="w-4 h-4" />;
  if (name.includes('late')) return <Coffee className="w-4 h-4" />;
  if (name.includes('hours')) return <Clock className="w-4 h-4" />;
  return <Utensils className="w-4 h-4" />;
}

function mealOrderRank(mealName: string): number {
  const name = mealName.toLowerCase();
  if (name.includes('breakfast')) return 10;
  if (name.includes('continental')) return 20;
  if (name.includes('brunch')) return 25;
  if (name.includes('lunch') && !name.includes('lite')) return 30;
  if (name.includes('lite')) return 35;
  if (name.includes('dinner')) return 40;
  if (name.includes('late')) return 50;
  return 100;
}

const PREFERENCE_TAGS = new Set([
  'halal',
  'kosher',
  'mindful',
  'plantbased',
  'vegan',
  'vegetarian',
]);

function menuTags(item: MenuItem): string[] {
  if (!item.dietary) return [];
  return item.dietary
    .replace(/[\[\]_]/g, '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function isPreferenceTag(tag: string): boolean {
  return PREFERENCE_TAGS.has(tag.toLowerCase().replace(/[\s-]+/g, ''));
}

function MenuTag({ tag }: { tag: string }) {
  const preference = isPreferenceTag(tag);
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold leading-4 ${
        preference
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200'
      }`}
    >
      {tag}
    </span>
  );
}

type FoodIconCategory =
  | 'pizza'
  | 'burger'
  | 'sandwich'
  | 'fish'
  | 'poultry'
  | 'meat'
  | 'dessert'
  | 'soup'
  | 'egg'
  | 'bakery'
  | 'coffee'
  | 'drink'
  | 'fruit'
  | 'salad'
  | 'bean'
  | 'vegetable'
  | 'snack'
  | 'dairy'
  | 'prepared'
  | 'default';

const FOOD_ICON_RULES: ReadonlyArray<{ pattern: RegExp; category: FoodIconCategory }> = [
  // Recognizable dish shapes win over individual ingredients.
  { pattern: /\b(pizza|flatbread|calzone)\b/i, category: 'pizza' },
  { pattern: /\b(burger|hamburger|cheeseburger)\b/i, category: 'burger' },
  { pattern: /\b(sandwich|sub|wrap|panini|club|melt|quesadilla|hot dog|gyro|taco|burrito|monte cristo)\b/i, category: 'sandwich' },
  { pattern: /\b(soup|stew|chili|chowder|bisque)\b/i, category: 'soup' },
  { pattern: /\b(pasta|noodles?|macaroni|ravioli|tortellini|rotini|rigatoni|penne|ziti|fettuccine|cavatappi|spaghetti|lasagna|casserole|casserette)\b/i, category: 'prepared' },
  // Prepared sauces beat words such as "poultry" and "cheese."
  { pattern: /\b(sauce|gravy|dressing|glaze|chimichurri|marinara|alfredo|dip|icing)\b/i, category: 'prepared' },
  { pattern: /\b(fish|salmon|tuna|pollock|cod|tilapia|shrimp|crab|lobster|shellfish|seafood)\b/i, category: 'fish' },
  { pattern: /\b(eggs?|omelets?|omelettes?|frittata|scrambl(?:e|ed))\b/i, category: 'egg' },
  { pattern: /\b(green|string|wax) beans?\b/i, category: 'vegetable' },
  // Plant proteins must beat meat words in names such as "Impossible Beef."
  { pattern: /\b(impossible|plant[- ]?based|tofu|tempeh|seitan|chickpeas?|beans?|lentils?|hummus)\b/i, category: 'bean' },
  { pattern: /\b(chicken|turkey|poultry|duck)\b/i, category: 'poultry' },
  { pattern: /\b(beef|brisket|steak|pork|ham|bacon|salami|sausages?|meatballs?|kielbasa|riblet)\b/i, category: 'meat' },
  { pattern: /\b(cookies?|cakes?|brownies?|dessert|cobbler|donuts?|doughnuts?|pudding|ice cream|gelato|sweet pie)\b/i, category: 'dessert' },
  { pattern: /\b(coffee|tea|espresso|latte|cappuccino)\b/i, category: 'coffee' },
  { pattern: /\b(soda|juice|lemonade|smoothie|beverage|drink|cocoa)\b/i, category: 'drink' },
  { pattern: /\b(potato(?:es)?|fries|tater tots?|hash browns?|chips?|nachos?)\b/i, category: 'snack' },
  { pattern: /\b(rice|oatmeal|oats|quinoa|grits|couscous|pilaf)\b/i, category: 'prepared' },
  { pattern: /\b(bread|breadsticks?|toast|biscuits?|pancakes?|waffles?|bagels?|croissants?|muffins?|danish|garlic knots?)\b/i, category: 'bakery' },
  { pattern: /\b(salad|greens?|lettuce|spinach|kale|slaw)\b/i, category: 'salad' },
  { pattern: /\b(carrots?|broccoli|sprouts?|zucchini|squash|vegetables?|veggie|corn|peas?|tomato(?:es)?|peppers?|onions?|beets?|cucumbers?|pickles?|mushrooms?|parsley|shallots?|scallions?|ginger|cacciatore)\b/i, category: 'vegetable' },
  { pattern: /\b(fruit|apples?|peach(?:es)?|watermelon|melons?|cantaloupe|honeydew|berries?|bananas?|oranges?|pineapple|grapes?|cranberry)\b/i, category: 'fruit' },
  { pattern: /\b(cheese|cheddar|swiss|provolone|yogurt|milk|cream|butter)\b/i, category: 'dairy' },
];

function getMenuItemIconCategory(itemName: string): FoodIconCategory {
  return FOOD_ICON_RULES.find(({ pattern }) => pattern.test(itemName))?.category ?? 'default';
}

function MenuItemIcon({ item, className }: { item: MenuItem; className: string }) {
  const iconProps = { className, strokeWidth: 1.6, 'aria-hidden': true as const };

  switch (getMenuItemIconCategory(item.name)) {
    case 'pizza': return <Pizza {...iconProps} />;
    case 'burger': return <Hamburger {...iconProps} />;
    case 'sandwich': return <Sandwich {...iconProps} />;
    case 'fish': return <Fish {...iconProps} />;
    case 'poultry': return <Drumstick {...iconProps} />;
    case 'meat': return <Beef {...iconProps} />;
    case 'dessert': return <Dessert {...iconProps} />;
    case 'soup': return <Soup {...iconProps} />;
    case 'egg': return <EggFried {...iconProps} />;
    case 'bakery': return <Croissant {...iconProps} />;
    case 'coffee': return <Coffee {...iconProps} />;
    case 'drink': return <CupSoda {...iconProps} />;
    case 'fruit': return <Apple {...iconProps} />;
    case 'salad': return <Salad {...iconProps} />;
    case 'bean': return <Bean {...iconProps} />;
    case 'vegetable': return <Carrot {...iconProps} />;
    case 'snack': return <Popcorn {...iconProps} />;
    case 'dairy': return <Milk {...iconProps} />;
    case 'prepared': return <CookingPot {...iconProps} />;
    default: return <Utensils {...iconProps} />;
  }
}

function MenuItemThumbnail({ item }: { item: MenuItem }) {
  return (
    <div className="flex min-h-[104px] w-[76px] flex-shrink-0 items-center justify-center border-r border-border/35 bg-gradient-to-br from-muted/55 to-muted/20 text-muted-foreground/65 sm:w-[88px]">
      <MenuItemIcon
        item={item}
        className="h-8 w-8 transition duration-200 group-hover:scale-105 group-hover:text-foreground/70"
      />
    </div>
  );
}

function MenuItemCard({ item, onSelect }: { item: MenuItem; onSelect: () => void }) {
  const tags = menuTags(item);

  return (
    <button
      type="button"
      aria-label={`View details for ${item.name}`}
      onClick={onSelect}
      className="group flex w-full overflow-hidden rounded-xl border border-border/60 bg-muted/15 text-left transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <MenuItemThumbnail item={item} />
      <span className="flex min-w-0 flex-1 flex-col p-3">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 font-semibold leading-snug text-foreground">
            {item.name}
          </span>
          {item.calories && (
            <span className="flex-shrink-0 whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {item.calories}
            </span>
          )}
        </span>
        {item.description && (
          <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {item.description}
          </span>
        )}
        <span className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className="flex min-w-0 flex-wrap gap-1">
            {tags.map((tag) => <MenuTag key={tag} tag={tag} />)}
          </span>
          <ChevronRight
            className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
            aria-hidden="true"
          />
        </span>
      </span>
    </button>
  );
}

// Sub-component for Food Preview
function FoodPreviewModal({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const dialogRef = useAccessibleDialog(true, onClose);

  return (
    <div className="fixed inset-x-0 top-0 bottom-[var(--keyboard-inset,0px)] z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
       <div className="absolute inset-0" onClick={onClose} />
       
       <div
         ref={dialogRef}
         role="dialog"
         aria-modal="true"
         aria-label={`${item.name} details`}
         tabIndex={-1}
         className="relative w-full max-w-lg bg-background rounded-2xl border border-border/50  shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
          
          <button 
            onClick={onClose}
            aria-label="Close item details"
            className="absolute top-3 right-3 p-2 bg-black/50 text-white hover:bg-black/70 rounded-full z-10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Item icon */}
          <div className="flex h-32 items-center justify-center border-b border-border/35 bg-gradient-to-br from-muted/60 to-muted/15 text-muted-foreground/65">
            <MenuItemIcon item={item} className="h-14 w-14" />
          </div>

          {/* Details */}
          <div className="p-6">
             <h2 className="text-2xl font-bold mb-2">{item.name}</h2>
             {item.description && (
                <p className="text-muted-foreground mb-4">{item.description}</p>
             )}
             
             <div className="flex flex-wrap gap-2 text-xs font-medium">
                {item.calories && (
                  <span className="px-2 py-1 bg-muted rounded-md text-foreground">
                    {item.calories}
                  </span>
                )}
                {menuTags(item).map((tag) => <MenuTag key={tag} tag={tag} />)}
             </div>
          </div>
       </div>
    </div>
  );
}

/**
 * Modal for browsing Birch dining menu sections and meal periods.
 */
export function MenuModal({ isOpen, onClose, defaultMeal }: MenuModalProps) {
  const dialogRef = useAccessibleDialog(isOpen, onClose);
  const [data, setData] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [, setMenuUpdatedUtc] = useState<string | null>(null);
  const [menuUnavailable, setMenuUnavailable] = useState(false);
  const [menuClosed, setMenuClosed] = useState<{ closed: boolean; reason?: string } | null>(null);
  const [diningHours, setDiningHours] = useState<DiningHoursResponse | null>(null);
  const [hoursLoading, setHoursLoading] = useState(true);
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);

  // PROB-020: relative day options follow the current Eastern day. They are
  // recomputed when the modal opens and when local midnight passes while it
  // stays open, so "Today" can never keep pointing at yesterday.
  const [todayKey, setTodayKey] = useState(() => formatDateParam(getEstDate()));
  useEffect(() => {
    if (!isOpen) return;
    const refresh = () => setTodayKey(formatDateParam(getEstDate()));
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [isOpen]);
  const dayOptions = useMemo<DayOption[]>(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = getEstDate(i);
      return { label: formatDayLabel(d, i), dateParam: formatDateParam(d), offset: i, date: d };
    });
    // todayKey is the recompute trigger: options derive from the current day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey]);

  const selectedDateParam = dayOptions[selectedDayOffset]?.dateParam ?? formatDateParam(getEstDate());
  const selectedDateLabel = formatMenuDate(dayOptions[selectedDayOffset]?.date ?? getEstDate());

  // Fetch menu data — for today uses /api/menu, for other days uses /api/menu/browse
  // PROB-020: only the latest selection may write view state; a slower older
  // response must never overwrite a newer date's content.
  const menuRequestSeq = useRef(0);
  const fetchMenuForDate = useCallback(async (dayOffset: number, dateParam: string) => {
    const requestSeq = ++menuRequestSeq.current;
    const isCurrent = () => menuRequestSeq.current === requestSeq;
    setLoading(true);
    setMenuUnavailable(false);
    setMenuClosed(null);
    setData([]);
    setActiveTab('');

    try {
      let content: string | null = null;
      let closed = false;
      let closureReason: string | undefined = undefined;

      if (dayOffset === 0) {
        // Today — use the pre-fetched local endpoint
        const loaded = await loadCampusData('/api/menu', anyObject);
        if (!isCurrent()) return;
        if (!loaded.ok) throw new Error(loaded.message);
        const resData = loaded.data as MenuApiResponse;
        content = resData.content ?? null;
        closed = Boolean(resData.closed);
        closureReason = resData.closureReason;
        const updatedValue = typeof resData.generatedUtc === 'string' && resData.generatedUtc.trim().length > 0
          ? resData.generatedUtc.trim()
          : (typeof resData.fileUpdatedUtc === 'string' ? resData.fileUpdatedUtc : null);
        setMenuUpdatedUtc(updatedValue);
      } else {
        // Future day — proxy through Sodexo
        const loaded = await loadCampusData(`/api/menu/browse?date=${dateParam}`, anyObject);
        if (!isCurrent()) return;
        if (!loaded.ok) throw new Error(loaded.message);
        const resData = loaded.data as MenuApiResponse;
        closed = Boolean(resData.closed);
        closureReason = resData.closureReason;
        if (resData.available && resData.content) {
          content = resData.content;
        }
        setMenuUpdatedUtc(null);
      }

      if (closed) {
        setMenuClosed({ closed: true, reason: closureReason || 'Seasonal closure' });
      }

      if (content) {
        const parsed = parseMenuMarkdown(content);
        setData(parsed);
        if (parsed.length === 0) {
          setMenuUnavailable(true);
          setActiveTab('Hours');
        } else if (defaultMeal && dayOffset === 0) {
          let mealToFind = defaultMeal.toLowerCase();
          if (mealToFind === 'breakfast') mealToFind = 'brunch';
          if (mealToFind === 'latenight') mealToFind = 'late night';
          if (mealToFind === 'litelunch') mealToFind = 'lite lunch';
          if (mealToFind === 'continental') mealToFind = 'continental';
          const targetMeal = parsed.find(m => m.name.toLowerCase().includes(mealToFind));
          setActiveTab(targetMeal ? targetMeal.name : (parsed[0]?.name || ''));
        } else {
          const lunch = parsed.find(m => m.name.toUpperCase().includes('LUNCH'));
          setActiveTab(lunch ? lunch.name : (parsed[0]?.name || 'Hours'));
        }
      } else {
        setMenuUnavailable(true);
        setActiveTab('Hours');
      }
    } catch (err) {
      if (!isCurrent()) return;
      console.error(err);
      setMenuUpdatedUtc(null);
      setMenuUnavailable(true);
      setActiveTab('Hours');
    } finally {
      if (!isCurrent()) return;
      setLoading(false);
    }
  }, [defaultMeal]);

  // Fetch and parse data
  useEffect(() => {
    if (!isOpen) return;
    fetchMenuForDate(selectedDayOffset, selectedDateParam);
  }, [isOpen, selectedDayOffset, selectedDateParam, fetchMenuForDate]);

  // Update active tab when defaultMeal changes (after data is loaded)
  // Update active tab when defaultMeal changes (after data is loaded)
  useEffect(() => {
    if (defaultMeal && data.length > 0) {
      // Map 'breakfast' -> 'brunch' and 'latenight' -> 'late night'
      let mealToFind = defaultMeal.toLowerCase();
      if (mealToFind === 'breakfast') mealToFind = 'brunch';
      if (mealToFind === 'latenight') mealToFind = 'late night';
      if (mealToFind === 'litelunch') mealToFind = 'lite lunch';
      if (mealToFind === 'continental') mealToFind = 'continental';
      
      if (mealToFind === 'hours') {
        setActiveTab('Hours');
        return;
      }

      const targetMeal = data.find(m => 
        m.name.toLowerCase().includes(mealToFind)
      );
      if (targetMeal) {
        setActiveTab(targetMeal.name);
      }
    }
  }, [defaultMeal, data]);

  // Fetch live dining hours synced to the selected date
  useEffect(() => {
    if (!isOpen) return;
    setHoursLoading(true);
    void loadCampusData(`/api/dining-hours?date=${selectedDateParam}`, anyObject).then(result => {
      if (!result.ok) {
        console.error('Unable to load dining hours:', result.message);
        setDiningHours(null);
        setHoursLoading(false);
        return;
      }
      setDiningHours(result.data as unknown as DiningHoursResponse);
      setHoursLoading(false);
    });
  }, [isOpen, selectedDateParam]);

  // Lock scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Filter logic
  const filteredStations = useMemo(() => {
    const currentMeal = data.find(m => m.name === activeTab);
    if (!currentMeal) return [];

    if (!searchQuery.trim()) return currentMeal.stations;

    const lowerQuery = searchQuery.toLowerCase();
    
    return currentMeal.stations.map(station => {
      if (station.name.toLowerCase().includes(lowerQuery)) return station;

      const matchingItems = station.items.filter(item => 
        item.name.toLowerCase().includes(lowerQuery) || 
        (item.description && item.description.toLowerCase().includes(lowerQuery)) ||
        (item.dietary && item.dietary.toLowerCase().includes(lowerQuery))
      );

      if (matchingItems.length > 0) {
        return { ...station, items: matchingItems };
      }
      return null;
    }).filter(Boolean) as Station[];

  }, [data, activeTab, searchQuery]);

  const orderedMeals = useMemo(() => {
    return [...data].sort((a, b) => {
      const rankDiff = mealOrderRank(a.name) - mealOrderRank(b.name);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name);
    });
  }, [data]);

  const openBalancePortal = () => {
    window.open(TRANSACT_BALANCE_URL, '_blank', 'noopener,noreferrer');
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={onClose} />

          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Birch Tree Inn menu"
            tabIndex={-1}
            className={`${MODAL_PANEL} font-sans`}>
              
              {/* Header Area */}
              <div className="flex flex-col border-b border-border bg-background z-10">
                  {/* Top Bar */}
                  <div className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-primary/20 border border-primary/35 rounded-lg">
                              <Utensils className="w-5 h-5 text-primary-foreground" />
                          </div>
                          <div>
                              <h2 className="text-lg font-bold leading-none">Birch Tree Inn Menu</h2>
                              <p className="mt-1 text-xs text-muted-foreground">{selectedDateLabel}</p>
                          </div>
                      </div>
                      <button 
                        onClick={onClose} 
                        aria-label="Close menu"
                        className="p-2 hover:bg-muted rounded-full transition-colors opacity-70 hover:opacity-100"
                      >
                          <X className="w-5 h-5" />
                      </button>
                  </div>

                  {/* Day Selector */}
                  <div className="px-5 py-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none no-scrollbar border-b border-border/50">
                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    {dayOptions.map((day) => (
                      <button
                        key={day.dateParam}
                        onClick={() => setSelectedDayOffset(day.offset)}
                        className={`
                          px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-200 whitespace-nowrap
                          ${selectedDayOffset === day.offset
                            ? 'bg-primary/15 text-primary border border-primary/30'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          }
                        `}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>

                  {/* Meal Selector & Search Row */}
                  <div className="px-5 pb-2.5 pt-1">
                      {/* Segmented Meal Tabs */}
                      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40 backdrop-blur-sm overflow-x-auto scrollbar-none no-scrollbar mb-2.5">
                          {/* Hours Tab */}
                          <button
                              onClick={() => setActiveTab('Hours')}
                              className={`
                                  flex items-center justify-center gap-2 h-9 px-3.5 rounded-lg text-xs font-semibold transition-all duration-200 whitespace-nowrap flex-shrink-0
                                  ${activeTab === 'Hours' 
                                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25' 
                                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                                  }
                              `}
                          >
                              <Clock className="w-3.5 h-3.5" />
                              <span>Hours</span>
                          </button>

                          {orderedMeals.map(meal => (
                               <button
                                  key={meal.name}
                                  onClick={() => setActiveTab(meal.name)}
                                  className={`
                                      flex items-center justify-center gap-2 h-9 px-3.5 rounded-lg text-xs font-semibold transition-all duration-200 whitespace-nowrap flex-shrink-0
                                      ${activeTab === meal.name 
                                          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25' 
                                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                                      }
                                  `}
                              >
                                  {getMealIcon(meal.name)}
                                  <span>{meal.name}</span>
                              </button>
                          ))}
                      </div>

                      {/* Search + Balance Row */}
                      <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input 
                                type="text"
                                aria-label="Search dining menu"
                                placeholder="Find food (e.g. 'chicken')..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 h-9 text-sm rounded-lg border border-border/60 bg-muted/30 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all placeholder:text-muted-foreground/60"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={openBalancePortal}
                            className="h-9 px-4 rounded-lg border border-border/60 bg-muted/30 text-xs font-semibold text-foreground hover:bg-muted hover:border-border transition-all whitespace-nowrap flex-shrink-0"
                          >
                            View Balance
                          </button>
                      </div>
                  </div>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 overflow-y-auto scrollbar-none bg-muted/10 p-4 sm:p-6 scroll-smooth">
                  {loading ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                          <Loader2 className="w-8 h-8 animate-spin text-primary" />
                          <p className="text-sm font-medium">Loading fresh menu data...</p>
                      </div>
                  ) : activeTab === 'Hours' ? (
                      <div className="space-y-4 max-w-3xl mx-auto">
                        {menuClosed?.closed ? (
                          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center mb-2">
                            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                              {selectedDayOffset === 0
                                ? 'Birch Tree Inn is Closed Today'
                                : `Birch Tree Inn is Closed on ${selectedDateLabel}`}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              The dining hall is closed ({menuClosed.reason || 'seasonal closure'}). No meals or food items are being served.
                            </p>
                          </div>
                        ) : menuUnavailable ? (
                          <div className="bg-muted/40 border border-border/60 rounded-xl p-4 text-center mb-2">
                            <p className="text-sm font-semibold text-foreground">
                              {selectedDayOffset === 0
                                ? 'No Menu Published Today'
                                : `No Menu Published for ${selectedDateLabel}`}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              The menu for this date is not yet available. See operating hours below.
                            </p>
                          </div>
                        ) : null}

                        {hoursLoading ? (
                          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                            <p className="text-sm font-medium">Loading hours for {selectedDateLabel}...</p>
                          </div>
                        ) : diningHours?.locations ? (
                          <>
                            {diningHours.dateFormatted && (
                              <p className="text-xs font-medium text-muted-foreground text-center">
                                Operating hours for {diningHours.dateFormatted}
                              </p>
                            )}
                            <div className="space-y-3">
                              {diningHours.locations.map((loc, idx) => {
                                const allClosed = loc.hours.length === 1 && (loc.hours[0].time === 'Closed' || loc.hours[0].time.toLowerCase().includes('closed'));
                                const generalMatch = diningHours.generalHours?.find((g) => g.name.toLowerCase() === loc.name.toLowerCase());
                                return (
                                  <div key={idx} className={`bg-background border rounded-xl p-4 shadow-sm ${allClosed ? 'border-border/50 opacity-80' : 'border-border'}`}>
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xl">{loc.emoji}</span>
                                        <h3 className="font-bold text-foreground">{loc.name}</h3>
                                      </div>
                                      {loc.isOverride && loc.overrideNote && (
                                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/25">
                                          {loc.overrideNote}
                                        </span>
                                      )}
                                    </div>
                                    {allClosed ? (
                                      <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2.5">
                                        <span className="text-sm font-medium text-foreground">Status</span>
                                        <span className="text-sm font-medium text-red-500">{loc.hours[0]?.time || 'Closed'}</span>
                                      </div>
                                    ) : (
                                      <div className={`grid gap-2 ${loc.hours.length > 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                                        {loc.hours.map((h, i) => (
                                          <div key={i} className="flex justify-between items-center bg-muted/30 rounded-lg px-3 py-2.5">
                                            <span className="text-sm font-medium text-foreground">{h.label || `Period ${i + 1}`}</span>
                                            <span className="text-sm text-primary font-medium">{h.time}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Compact regular weekly hours if active */}
                                    {generalMatch && generalMatch.schedule.length > 0 && !allClosed && (
                                      <div className="mt-3 pt-2.5 border-t border-border/40 text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                                        {generalMatch.schedule.map((gs, gsi) => (
                                          <span key={gsi}>
                                            <strong className="font-medium text-foreground/80">{gs.days}:</strong> {gs.hours.map((h) => h.time).join(', ')}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground opacity-60">
                            <p className="text-sm">Unable to load hours</p>
                          </div>
                        )}
                        
                        {/* Footer Note */}
                        <p className="text-xs text-center text-muted-foreground pt-2">
                          Hours may vary during holidays and seasonal breaks
                        </p>
                      </div>
                  ) : filteredStations && filteredStations.length > 0 ? (
                      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                          {filteredStations.map((station) => (
                              <div key={station.name} className="bg-background rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
                                  {/* Station Header */}
                                  <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                                      <h3 className="font-bold text-sm uppercase tracking-wide text-primary">
                                          {station.name}
                                      </h3>
                                      <span className="text-[10px] font-mono text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border">
                                          {station.items.length} items
                                      </span>
                                  </div>
                                  {/* Items List */}
                                  <div className="space-y-2.5 p-3">
                                      {station.items.map((item) => (
                                          <MenuItemCard
                                            key={item.name}
                                            item={item}
                                            onSelect={() => setSelectedItem(item)}
                                          />
                                      ))}
                                  </div>
                              </div>
                          ))}
                      </div>
                  ) : (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-60">
                          <div className="bg-muted p-4 rounded-full mb-3">
                              <Utensils className="w-8 h-8" />
                          </div>
                          <p>No items found for &quot;{searchQuery}&quot; in {activeTab}</p>
                      </div>
                  )}
              </div>
          </div>
      </div>
      
      {/* Food Preview Modal */}
      {selectedItem && (
        <FoodPreviewModal 
          item={selectedItem} 
          onClose={() => setSelectedItem(null)} 
        />
      )}
    </>
  );
}
