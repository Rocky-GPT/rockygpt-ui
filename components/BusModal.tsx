/**
 * @module components/BusModal
 * Full-screen modal displaying the Ramapo Roadrunner Express shuttle,
 * Shortline bus, and train-loop schedules with tab-based navigation.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { useAccessibleDialog } from '@/components/useAccessibleDialog';
import { X, Bus, MapPin, TrainFront } from 'lucide-react';
import type { ShuttleRoute, ShuttleSchedule } from '@/lib/data-types';
import { MODAL_PANEL } from '@/components/modalShell';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const pickupLocations = [
  { name: "Bradley Center", detail: "Main Campus Stop" },
  { name: "Interstate Plaza", detail: "In front of Macy's" },
  { name: "Garden State Plaza", detail: "Bus shelters across from Neiman Marcus" },
  { name: "Ramsey Train Station", detail: "Rt 17 Train Station" },
  { name: "CityMD Ramsey", detail: "Outside main entrance" },
  { name: "Ramsey Square", detail: "Shopping Center" },
];

type ShortlineDayKey = 'weekday' | 'saturday' | 'sunday';

const EMPTY_SCHEDULE: ShuttleSchedule = {
  trainLoop: [],
  shortline: {
    toNYC: { weekday: [], saturday: [], sunday: [] },
    fromNYC: { weekday: [], saturday: [], sunday: [] },
  },
  weekday: [],
  saturday: [],
  sunday: [],
};

/**
 * Modal for Ramapo shuttle and bus schedules.
 */
export function BusModal({ isOpen, onClose }: ModalProps) {
  const dialogRef = useAccessibleDialog(isOpen, onClose);
  const [activeTab, setActiveTab] = useState<string>('Weekday');
  const [serviceType, setServiceType] = useState<'Roadrunner' | 'TrainLoop' | 'Shortline' | 'MoreInfo'>('Roadrunner');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [shuttleSchedule, setShuttleSchedule] = useState<ShuttleSchedule>(EMPTY_SCHEDULE);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const serviceBadgeClass: Record<'Roadrunner' | 'TrainLoop' | 'Shortline' | 'MoreInfo', string> = {
    Roadrunner: 'bg-primary/20 border border-primary/35 text-primary-foreground',
    TrainLoop: 'bg-primary/20 border border-primary/35 text-primary-foreground',
    Shortline: 'bg-primary/20 border border-primary/35 text-primary-foreground',
    MoreInfo: 'bg-primary/20 border border-primary/35 text-primary-foreground',
  };
  const serviceButtonActiveClass: Record<'Roadrunner' | 'TrainLoop' | 'Shortline' | 'MoreInfo', string> = {
    Roadrunner: 'bg-[#631c26] text-white border border-[#7a2a37]/70 shadow-sm',
    TrainLoop: 'bg-[#631c26] text-white border border-[#7a2a37]/70 shadow-sm',
    Shortline: 'bg-[#631c26] text-white border border-[#7a2a37]/70 shadow-sm',
    MoreInfo: 'bg-[#631c26] text-white border border-[#7a2a37]/70 shadow-sm',
  };
  const dayButtonActiveClass: Record<'Weekday' | 'Saturday' | 'Sunday', string> = {
    Weekday: 'bg-[#631c26] text-white border border-[#7a2a37]/70 shadow-sm',
    Saturday: 'bg-[#631c26] text-white border border-[#7a2a37]/70 shadow-sm',
    Sunday: 'bg-[#631c26] text-white border border-[#7a2a37]/70 shadow-sm',
  };

  // Determine current day type for defaulting
  const today = new Date();
  const dayNum = today.getDay();
  const currentDayType = dayNum === 0 ? 'Sunday' : dayNum === 6 ? 'Saturday' : 'Weekday';

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    void fetch('/api/shuttle', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Shuttle service answered ${response.status}`);
        return response.json() as Promise<ShuttleSchedule>;
      })
      .then(setShuttleSchedule)
      .catch((error) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Unable to load shuttle schedule:', error);
        }
      });
    return () => controller.abort();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setCurrentTime(new Date());
      setActiveTab(currentDayType);
      
      const timer = setInterval(() => setCurrentTime(new Date()), 60000);
      return () => clearInterval(timer);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen, serviceType, currentDayType]); // Re-run when service type changes to reset tab defaults

  useEffect(() => {
    if (!isOpen) return;

    const scrollToNextCard = () => {
      const container = contentRef.current;
      if (!container) return;

      const nextCard = container.querySelector<HTMLElement>('[data-next-bus="true"]');
      if (!nextCard) return;

      const containerRect = container.getBoundingClientRect();
      const cardRect = nextCard.getBoundingClientRect();
      const targetTop =
        container.scrollTop + (cardRect.top - containerRect.top) - container.clientHeight * 0.2;

      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth',
      });
    };

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(scrollToNextCard);
    });
    const timeoutId = window.setTimeout(scrollToNextCard, 180);

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      clearTimeout(timeoutId);
    };
  }, [isOpen, activeTab, serviceType]);

  if (!isOpen) return null;


  // Helper to get schedule for a specific date
  // Helper to parse time string "7:00 AM" to Date object for comparison
  const parseTime = (timeStr: string, baseDate: Date) => {
    const [time, modifier] = timeStr.split(' ');
    const [hourPart, minutePart] = time.split(':').map(Number);
    let hours = hourPart;
    const minutes = minutePart;
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    
    const date = new Date(baseDate);
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const getScheduleForDate = (date: Date): { type: string, routes: ShuttleRoute[] } => {
    const day = date.getDay(); // 0 = Sunday, 6 = Saturday

    if (serviceType === 'TrainLoop') {
      if (shuttleSchedule.trainLoop) {
         if (day === 0 || day === 6) return { type: 'No Service (Weekend)', routes: [] };
         return { type: 'Weekday', routes: shuttleSchedule.trainLoop };
      }
      return { type: 'No Service', routes: [] };
    }

    if (serviceType === 'Shortline') {
       if (!shuttleSchedule.shortline) return { type: 'Information', routes: [] };
       // Map simple string arrays to ShuttleRoute format for consistent rendering
       // We'll create a helper to convert "HH:MM" 24h to "H:MM AM/PM"
       const to12h = (time24: string) => {
         const [h, m] = time24.split(':').map(Number);
         const period = h >= 12 ? 'PM' : 'AM';
         const h12 = h % 12 || 12;
         return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
       };

       const createRoute = (time: string, direction: 'To NYC' | 'From NYC') => ({
          departure: to12h(time),
          stops: [{ location: direction === 'To NYC' ? 'Port Authority' : 'Main Entrance', time: 'Arrive' }],
          arrival: direction === 'To NYC' ? 'NYC' : 'Ramapo'
       });

       const getTimes = (dir: 'toNYC' | 'fromNYC') => {
          if (day === 0) return shuttleSchedule.shortline[dir].sunday;
          if (day === 6) return shuttleSchedule.shortline[dir].saturday;
          return shuttleSchedule.shortline[dir].weekday;
       };
       
       const toNYC = getTimes('toNYC').map(t => createRoute(t, 'To NYC'));
       const fromNYC = getTimes('fromNYC').map(t => createRoute(t, 'From NYC'));
       
       // Sort by time
       const allRoutes = [...toNYC, ...fromNYC].sort((a, b) => {
          const dateA = parseTime(a.departure, new Date());
          const dateB = parseTime(b.departure, new Date());
          return dateA.getTime() - dateB.getTime();
       });

       return { type: day === 0 ? 'Sunday' : day === 6 ? 'Saturday' : 'Weekday', routes: allRoutes };
    }

    if (serviceType === 'MoreInfo') {
      return { type: 'Information', routes: [] };
    }

    if (day === 0) return { type: 'Sunday', routes: shuttleSchedule.sunday };
    if (day === 6) return { type: 'Saturday', routes: shuttleSchedule.saturday };
    return { type: 'Weekday', routes: shuttleSchedule.weekday };
  };

  // Determine schedules
  const todaySchedule = getScheduleForDate(today);

  // Find next bus for Today / Current Tab
  let nextBusIndex = -1;
  const isViewingCurrentDay = activeTab === currentDayType;

  if (isViewingCurrentDay) {
    const routesToCheck = serviceType === 'Roadrunner' 
       ? (activeTab === 'Weekday' ? shuttleSchedule.weekday : activeTab === 'Saturday' ? shuttleSchedule.saturday : shuttleSchedule.sunday)
       : serviceType === 'TrainLoop'
       ? (activeTab === 'Weekday' ? (shuttleSchedule.trainLoop || []) : [])
       : (dayNum === 0 ? todaySchedule.routes : dayNum === 6 ? todaySchedule.routes : todaySchedule.routes);

    // For Shortline, the routes are already computed in getScheduleForDate based on the actual date
    // For Roadrunner, we use the static arrays.
    
    const finalRoutes = (serviceType === 'Shortline') ? todaySchedule.routes : routesToCheck;

    nextBusIndex = finalRoutes.findIndex(route => {
      const busTime = parseTime(route.departure, today);
      return busTime > currentTime;
    });
  }

  const renderRoutes = (routes: ShuttleRoute[], highlightIndex: number = -1) => (
    <div className="space-y-3">
      {routes.map((route, idx) => {
        const isNext = idx === highlightIndex;
        return (
          <div 
            key={idx} 
            data-next-bus={isNext ? 'true' : undefined}
            className={`
              border rounded-xl p-3 transition-colors
              ${isNext 
                ? 'bg-primary/10 border-primary shadow-sm' 
                : 'bg-muted/30 border-border'
              }
            `}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🚌</span>
                <span className={`font-bold ${isNext ? 'text-primary' : 'text-foreground'}`}>
                  {route.departure}
                </span>
                {isNext && (
                  <span className="text-[10px] uppercase font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full animate-pulse">
                    Next
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Arrives: <span className="font-medium text-foreground">{route.arrival}</span>
              </div>
            </div>
            
            {/* Timeline/Stops */}
            <div className="relative pl-2 ml-1 border-l-2 border-border/50 space-y-2 py-1">
               {route.stops.map((stop, i) => (
                 <div key={i} className="flex flex-col relative">
                   <div className="absolute -left-[13px] top-1.5 w-2 h-2 rounded-full bg-muted-foreground/30"></div>
                   <div className="text-xs">
                     <span className="font-medium text-foreground mr-1.5">{stop.time}</span>
                     <span className="text-muted-foreground">{stop.location}</span>
                   </div>
                 </div>
               ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shuttle and bus schedules"
        tabIndex={-1}
        className={MODAL_PANEL}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${serviceBadgeClass[serviceType]}`}>
              {serviceType === 'Roadrunner' && <Bus className="w-5 h-5 text-current" />}
              {serviceType === 'TrainLoop' && <TrainFront className="w-5 h-5 text-current" />}
              {serviceType === 'Shortline' && <Bus className="w-5 h-5 text-current" />}
              {serviceType === 'MoreInfo' && <div className="w-5 h-5 text-current font-bold flex items-center justify-center">?</div>}
            </div>
            <div>
              <h2 className="text-xl font-bold leading-none mb-1">Shuttle & Transit</h2>
              <p className="text-xs text-muted-foreground font-medium">
                {serviceType === 'Roadrunner' && 'Ramapo Roadrunner Express'}
                {serviceType === 'TrainLoop' && 'Mid-Day Express Loop'}
                {serviceType === 'Shortline' && 'Coach USA / Shortline Bus'}
                {serviceType === 'MoreInfo' && 'Transportation Resources'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shuttle and bus schedules"
            className="p-2 hover:bg-muted rounded-full transition-colors opacity-70 hover:opacity-100"
          >
            <X aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        {/* Service Switcher */}
        <div className="px-4 pt-3 pb-1 bg-background">
          <div className="grid grid-cols-4 gap-1 p-1 bg-muted rounded-lg border border-border/60">
            <button
               onClick={() => setServiceType('Roadrunner')}
               className={`w-full px-2 py-1.5 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap ${serviceType === 'Roadrunner' ? serviceButtonActiveClass.Roadrunner : 'text-muted-foreground hover:text-foreground hover:bg-background/40'}`}
            >
              Roadrunner
            </button>
            <button
               onClick={() => setServiceType('TrainLoop')}
               className={`w-full px-2 py-1.5 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap ${serviceType === 'TrainLoop' ? serviceButtonActiveClass.TrainLoop : 'text-muted-foreground hover:text-foreground hover:bg-background/40'}`}
            >
              Mid-Day
            </button>
            <button
               onClick={() => setServiceType('Shortline')}
               className={`w-full px-2 py-1.5 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap ${serviceType === 'Shortline' ? serviceButtonActiveClass.Shortline : 'text-muted-foreground hover:text-foreground hover:bg-background/40'}`}
            >
              Shortline
            </button>
            <button
               onClick={() => setServiceType('MoreInfo')}
               className={`w-full px-2 py-1.5 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap ${serviceType === 'MoreInfo' ? serviceButtonActiveClass.MoreInfo : 'text-muted-foreground hover:text-foreground hover:bg-background/40'}`}
            >
              More Info
            </button>
          </div>
        </div>

        {/* Tabs */}
        {(serviceType === 'Roadrunner' || serviceType === 'TrainLoop' || serviceType === 'Shortline') && (
          <div className="flex border-b border-border bg-muted/30 p-1 gap-1">
             {(['Weekday', 'Saturday', 'Sunday'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border border-transparent transition-all ${
                  activeTab === tab
                    ? dayButtonActiveClass[tab]
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        {/* Info Banner */}
        {((serviceType === 'TrainLoop' || serviceType === 'Shortline' || serviceType === 'Roadrunner') && activeTab === currentDayType) && (
          <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-2 flex items-center justify-between">
             <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
               Showing Today&apos;s Schedule
             </span>
             <span className="text-[10px] text-muted-foreground">
               {today.toLocaleDateString([], { month: 'short', day: 'numeric' })}
             </span>
          </div>
        )}

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto scrollbar-none p-4">
          {/* Modal Content */}
          {(activeTab === 'Weekday' || activeTab === 'Saturday' || activeTab === 'Sunday') && (
             <div className="space-y-4">
                {serviceType === 'Roadrunner' && renderRoutes(
                   activeTab === 'Weekday' ? shuttleSchedule.weekday : 
                   activeTab === 'Saturday' ? shuttleSchedule.saturday : 
                   shuttleSchedule.sunday,
                   nextBusIndex
                )}

                {serviceType === 'TrainLoop' && (
                   activeTab === 'Weekday' ? (
                      shuttleSchedule.trainLoop ? renderRoutes(shuttleSchedule.trainLoop, nextBusIndex) : <p>No data</p>
                   ) : (
                      <div className="text-center py-10 text-muted-foreground">
                         <p>No Mid-Day service on {activeTab}s.</p>
                      </div>
                   )
                )}

                {serviceType === 'Shortline' && (
                   <div className="space-y-4">
                      {(() => {
                        const shortlineDayKey = activeTab.toLowerCase() as ShortlineDayKey;
                        const toNycTimes = shuttleSchedule.shortline?.toNYC?.[shortlineDayKey] ?? [];
                        const fromNycTimes = shuttleSchedule.shortline?.fromNYC?.[shortlineDayKey] ?? [];

                        return (
                          <>
                      <div className="bg-muted/30 border border-border rounded-xl p-4">
                        <h3 className="font-bold text-lg mb-2">🚍 {activeTab} Schedule</h3>
                        <div className="grid grid-cols-2 gap-4">
                           <div>
                              <h4 className="font-semibold text-xs text-primary mb-2 uppercase tracking-wider">To NYC</h4>
                              <div className="space-y-1">
                                {toNycTimes.map((t: string) => {
                                   const [h, m] = t.split(':').map(Number);
                                   const period = h >= 12 ? 'PM' : 'AM';
                                   const h12 = h % 12 || 12;
                                   return (
                                     <div key={t} className="text-sm border-b border-border/50 py-1 flex justify-between">
                                        <span>{h12}:{m.toString().padStart(2, '0')} {period}</span>
                                     </div>
                                   );
                                })}
                              </div>
                           </div>
                           <div>
                              <h4 className="font-semibold text-xs text-primary mb-2 uppercase tracking-wider">From NYC</h4>
                              <div className="space-y-1">
                                {fromNycTimes.map((t: string) => {
                                   const [h, m] = t.split(':').map(Number);
                                   const period = h >= 12 ? 'PM' : 'AM';
                                   const h12 = h % 12 || 12;
                                   return (
                                     <div key={t} className="text-sm border-b border-border/50 py-1 flex justify-between">
                                        <span>{h12}:{m.toString().padStart(2, '0')} {period}</span>
                                     </div>
                                   );
                                })}
                              </div>
                           </div>
                        </div>
                      </div>
                      <div className="bg-background border border-border rounded-lg p-3 text-xs">
                         <p>From NYC buses depart from <strong>Port Authority Gates 408/409</strong>.</p>
                         <p>Tickets: $9.00 (Student Discount) at CSI Office.</p>
                      </div>
                          </>
                        );
                      })()}
                   </div>
                )}
                
                {serviceType === 'Roadrunner' && (
                   <div className="pt-4 border-t border-border">
                      <h3 className="font-bold mb-2 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        Pickup Locations
                      </h3>
                      <div className="space-y-2">
                        {pickupLocations.map((loc, idx) => (
                          <div key={idx} className="bg-muted/30 border border-border rounded-xl p-3">
                            <p className="font-medium text-foreground">{loc.name}</p>
                            <p className="text-xs text-muted-foreground">{loc.detail}</p>
                          </div>
                        ))}
                      </div>
                   </div>
                )}
             </div>
          )}

          {serviceType === 'MoreInfo' && (
            <div className="space-y-5 pt-2">
              {/* Parking Section */}
              <div className="space-y-2">
                <h3 className="font-bold text-base flex items-center gap-2 text-primary">
                  <div className="p-1 bg-primary/10 rounded-md"><MapPin className="w-3.5 h-3.5" /></div>
                  Parking Info
                </h3>
                <div className="bg-muted/30 border border-border rounded-xl p-4 text-sm space-y-3">
                   <div className="flex justify-between items-start border-b border-border/50 pb-2">
                     <div>
                       <span className="font-semibold block">Commuter Permit</span>
                       <span className="text-xs text-muted-foreground">Valid in B1, B2, B3 lots</span>
                     </div>
                     <span className="font-bold text-foreground">~$213/yr</span>
                   </div>
                   <div className="flex justify-between items-start border-b border-border/50 pb-2">
                     <div>
                       <span className="font-semibold block">Resident Permit</span>
                       <span className="text-xs text-muted-foreground">Assigned lot only</span>
                     </div>
                     <span className="font-bold text-foreground">~$200/yr</span>
                   </div>
                   <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 text-xs text-red-600 dark:text-red-400">
                     <span className="font-bold">⚠️ Important Rule:</span> No overnight parking in commuter lots between <strong>2:00 AM - 6:00 AM</strong>.
                   </div>
                   <div className="text-xs text-muted-foreground">
                     Guests must be registered online for overnight stays.
                   </div>
                </div>
              </div>

              {/* Other Transit */}
              <div className="space-y-2">
                <h3 className="font-bold text-base flex items-center gap-2 text-primary">
                  <div className="p-1 bg-primary/10 rounded-md"><TrainFront className="w-3.5 h-3.5" /></div>
                  NJ Transit Train
                </h3>
                <div className="bg-muted/30 border border-border rounded-xl p-4 text-sm">
                   <p className="mb-2">
                     <strong>Ramsey Route 17 Station</strong> is the closest train hub.
                   </p>
                   <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground">
                     <li>Access via <strong>Mid-Day Express</strong> shuttle or <strong>Roadrunner Express</strong>.</li>
                     <li>Direct service to Secaucus Junction & Hoboken.</li>
                     <li>Connect at Secaucus for NYC Penn Station.</li>
                   </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
