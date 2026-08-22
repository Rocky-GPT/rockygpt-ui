'use client';

import React, { useState, useEffect } from 'react';
import {
  Utensils,
  Bus,
  MapPin,
  Users,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  GraduationCap,
  Briefcase,
  Award,
  Globe,
  HeartHandshake,
  Check,
  CreditCard,
  Leaf,
  Coffee,
  Train,
  Repeat,
  ShoppingBag,
  Clock,
  BookOpen,
  Building2,
  Printer,
  Car,
  Code2,
  Gamepad2,
  Gift,
  Landmark,
  ExternalLink,
} from 'lucide-react';

export type UserRole =
  | 'current_student'
  | 'incoming_student'
  | 'alumni'
  | 'staff_faculty'
  | 'parent'
  | 'other';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

type OnboardingStep = 1 | 2 | 3 | 4 | 5;

const TOTAL_STEPS = 5;

const STEP_META: Record<OnboardingStep, { title: string; subtitle: string }> = {
  1: {
    title: 'Welcome to RockyGPT',
    subtitle: 'Your AI guide to Ramapo College',
  },
  2: {
    title: 'The Story Behind RockyGPT',
    subtitle: 'From a campaign promise to a campus assistant',
  },
  3: {
    title: 'Who Are You',
    subtitle: 'Personalizes your suggested tools & questions',
  },
  4: {
    title: 'Feature Highlights',
    subtitle: 'Explore what Rocky can do around campus',
  },
  5: {
    title: 'Starter Questions',
    subtitle: 'Tap any prompt or launch directly',
  },
};





const ROLES_LIST = [
  {
    key: 'current_student',
    label: 'Current Student',
    desc: 'Currently enrolled at Ramapo',
    icon: GraduationCap,
  },
  {
    key: 'incoming_student',
    label: 'Incoming Student',
    desc: 'Prospective or newly admitted',
    icon: Sparkles,
  },
  {
    key: 'alumni',
    label: 'Alumni',
    desc: 'Ramapo College graduate',
    icon: Award,
  },
  {
    key: 'staff_faculty',
    label: 'Staff / Faculty',
    desc: 'Professors & university staff',
    icon: Briefcase,
  },
  {
    key: 'parent',
    label: 'Parent',
    desc: 'Family member or guardian',
    icon: HeartHandshake,
  },
  {
    key: 'other',
    label: 'Others',
    desc: 'Campus guest or community',
    icon: Globe,
  },
];

const ROLE_PROMPTS: Record<UserRole, string[]> = {
  current_student: [
    "yo what's on the menu at birch today",
    "when does the next shuttle pull up to the train station",
    "any campus events with free food this week",
    "where's the best hidden quiet study spot on campus",
    "how do i get to the csi office in the student center",
    "is dunkin open rn in the library and can i use flex",
  ],
  incoming_student: [
    "what's freshman dorm life & roommate selection like?",
    "how do meal swipes and flex dollars actually work?",
    "what are the biggest campus traditions and clubs to join?",
    "how do i find my classrooms in the academic wings before day 1?",
    "what should i pack for move-in day at Bischoff or Mackin?",
    "what are the most fun things to do around Mahwah on weekends?",
  ],
  alumni: [
    "How do I request official transcripts or degree verification?",
    "What alumni career networking and Homecoming events are coming up?",
    "Can alumni still use the Potter Library and Bradley Center gym?",
    "How do I connect with the Ramapo Alumni Mentor network?",
    "What has changed on campus since the new Adler Center opened?",
  ],
  staff_faculty: [
    "What are today's dining specials and campus cafe hours?",
    "When are key academic deadlines, add/drop, and final grading dates?",
    "Where is the nearest faculty print kiosk and IT Help Desk?",
    "What is the Public Safety dispatch line and emergency contact?",
    "How do I reserve a meeting room or conference space in ASB?",
  ],
  parent: [
    "Where is designated visitor parking when coming to visit campus?",
    "What campus safety resources and 24/7 security escorts are available?",
    "When is Family Day and graduation Commencement ceremony?",
    "How can I add funds to my student's flex account or check meal plans?",
    "What health and counseling services are available for students?",
  ],
  other: [
    "How do I navigate between academic wings and the student center?",
    "Are the scenic campus walking trails and Potter Library open to the public?",
    "Where is the Bradley Center athletic complex and visitor parking?",
    "What campus performances, art galleries, and events are open to guests?",
    "Where can campus visitors grab coffee or lunch on campus?",
  ],
};

const FEATURE_TABS = ['dining', 'shuttles', 'map', 'clubs'] as const;

export function WelcomeModal({
  isOpen,
  onClose,
  onSelectPrompt,
}: WelcomeModalProps) {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [activeDemoTab, setActiveDemoTab] = useState<'dining' | 'shuttles' | 'map' | 'clubs'>('dining');

  // Load saved preferences if any
  useEffect(() => {
    try {
      const savedRole = window.localStorage.getItem('rockygpt_user_role') as UserRole;
      if (savedRole && ROLES_LIST.some((r) => r.key === savedRole)) {
        setUserRole(savedRole);
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleContinue = () => {
    if (step === 3 && !userRole) {
      return;
    }
    if (step === 4) {
      const currentIndex = FEATURE_TABS.indexOf(activeDemoTab);
      if (currentIndex < FEATURE_TABS.length - 1) {
        setActiveDemoTab(FEATURE_TABS[currentIndex + 1]);
        return;
      }
    }
    if (step === 3) {
      setActiveDemoTab('dining');
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1) as OnboardingStep);
  };

  const handleBack = () => {
    if (step === 4) {
      const currentIndex = FEATURE_TABS.indexOf(activeDemoTab);
      if (currentIndex > 0) {
        setActiveDemoTab(FEATURE_TABS[currentIndex - 1]);
        return;
      }
    }
    if (step === 5) {
      setActiveDemoTab('clubs');
    }
    setStep((s) => Math.max(1, s - 1) as OnboardingStep);
  };

  if (!isOpen) return null;

  const handleRoleSelect = (role: UserRole) => {
    setUserRole(role);
    try {
      window.localStorage.setItem('rockygpt_user_role', role);
    } catch {
      // Ignore
    }
  };

  const handleFinish = (prompt?: string) => {
    try {
      window.localStorage.setItem('rockygpt_welcome_seen', 'true');
      if (userRole) {
        window.localStorage.setItem('rockygpt_user_role', userRole);
      }
    } catch {
      // Ignore
    }
    onClose();
    if (prompt) {
      onSelectPrompt(prompt);
    }
  };

  const currentMeta = STEP_META[step];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-modal-backdrop"
    >
      {/* Magical Ambient Backlight Glow */}
      <div className="absolute pointer-events-none w-[420px] sm:w-[560px] h-[360px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(142,10,38,0.4),rgba(244,168,181,0.12)_45%,transparent_70%)] blur-2xl animate-magical-backlight" />

      {/* Backdrop (non-dismissible) */}
      <div className="fixed inset-0" />

      {/* Modal Card with Magical Spring Entrance */}
      <div className="relative w-full max-w-lg flex flex-col bg-background rounded-2xl border border-border/80 shadow-2xl animate-onboarding-magical overflow-hidden z-10">
        
        {/* Dynamic Modal Header with Twinkling Sparkles Icon */}
        <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5 border-b border-border bg-card/40 shrink-0">
          <Sparkles className="h-5 w-5 text-[#f4a8b5] shrink-0 animate-sparkle-magical" />
          <div className="min-w-0">
            <h3 id="onboarding-modal-title" className="text-sm font-semibold text-foreground truncate">
              {currentMeta.title}
            </h3>
            <p className="text-[11px] text-muted-foreground truncate">
              {currentMeta.subtitle}
            </p>
          </div>

          <span className="ml-auto shrink-0 rounded-full border border-[#8a2432]/50 bg-[#4d161d]/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f4a8b5]">
            Beta
          </span>
        </div>

        {/* Modal Body with balanced vertical content */}
        <div className="px-4 sm:px-5 py-4 overflow-y-auto max-h-[62vh] sm:max-h-[60vh] scrollbar-thin flex-1 space-y-3">
          
          {/* ================= STEP 1: Meet RockyGPT ================= */}
          {step === 1 && (
            <div className="space-y-3">
              {/* Hero Headline & Subtext */}
              <div className="px-1 pt-0.5 space-y-1 animate-magical-item" style={{ animationDelay: '120ms' }}>
                <h4 className="text-sm sm:text-base font-bold text-foreground leading-snug">
                  Everything Ramapo, one conversation away.
                </h4>
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                  Direct, verified answers for dining, shuttles, room codes, faculty, clubs, and campus events.
                </p>
              </div>

              {/* 4 Core Pillars Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border bg-[#1c1c20] shadow-xs animate-magical-item"
                  style={{ animationDelay: '220ms' }}
                >
                  <div className="p-1.5 rounded-lg bg-card border border-border text-[#f4a8b5] shrink-0">
                    <Utensils className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate">Live Dining</div>
                    <div className="text-[10px] text-muted-foreground truncate">Birch menus & cafes</div>
                  </div>
                </div>

                <div
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border bg-[#1c1c20] shadow-xs animate-magical-item"
                  style={{ animationDelay: '320ms' }}
                >
                  <div className="p-1.5 rounded-lg bg-card border border-border text-[#f4a8b5] shrink-0">
                    <Bus className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate">Shuttle Loops</div>
                    <div className="text-[10px] text-muted-foreground truncate">Train & campus loops</div>
                  </div>
                </div>

                <div
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border bg-[#1c1c20] shadow-xs animate-magical-item"
                  style={{ animationDelay: '420ms' }}
                >
                  <div className="p-1.5 rounded-lg bg-card border border-border text-[#f4a8b5] shrink-0">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate">Room Finder</div>
                    <div className="text-[10px] text-muted-foreground truncate">Buildings & classrooms</div>
                  </div>
                </div>

                <div
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border bg-[#1c1c20] shadow-xs animate-magical-item"
                  style={{ animationDelay: '520ms' }}
                >
                  <div className="p-1.5 rounded-lg bg-card border border-border text-[#f4a8b5] shrink-0">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate">100+ Clubs</div>
                    <div className="text-[10px] text-muted-foreground truncate">Orgs & CSI events</div>
                  </div>
                </div>
              </div>

              {/* Trust Footer Bar */}
              <div
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-card/60 border border-border text-[11px] text-muted-foreground animate-magical-item"
                style={{ animationDelay: '620ms' }}
              >
                <span className="inline-flex items-center gap-1">
                  <Check className="h-3 w-3 text-[#f4a8b5]" /> Free to use
                </span>
                <span className="inline-flex items-center gap-1">
                  <Check className="h-3 w-3 text-[#f4a8b5]" /> No account needed
                </span>
                <span className="inline-flex items-center gap-1">
                  <Check className="h-3 w-3 text-[#f4a8b5]" /> Built for Ramapo
                </span>
              </div>
            </div>
          )}

          {/* ================= STEP 2: The Story Behind RockyGPT ================= */}
          {step === 2 && (
            <div className="border-l-2 border-[#f4a8b5] pl-4 space-y-3.5 my-1 text-xs sm:text-[13px] leading-relaxed text-muted-foreground">
              <p className="animate-magical-item" style={{ animationDelay: '80ms' }}>
                RockyGPT began with a promise I made during my 2023 SGA election campaign to improve Rocky the Roadrunner and make campus information easier for students to access.
              </p>
              <p className="animate-magical-item" style={{ animationDelay: '160ms' }}>
                The idea later became a business plan in my entrepreneurship class, and eventually my senior capstone project.
              </p>
              <p className="animate-magical-item" style={{ animationDelay: '240ms' }}>
                What started as a campaign promise became something I wanted to leave behind for the Roadrunner community.
              </p>

              {/* Signature: names the "I" the story is told in */}
              <div className="flex items-center gap-2.5 pt-0.5 animate-magical-item" style={{ animationDelay: '320ms' }}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#8a2432]/60 bg-[#4d161d]/70 text-[11px] font-semibold text-[#f4a8b5]">
                  DR
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground leading-tight">
                    Daniel Rajakumar
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-tight">
                    Class of ’26 · Developer of RockyGPT
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 3: Who Are You ================= */}
          {step === 3 && (
            <div className="space-y-2">
              <div className="flex flex-col gap-1.5 overflow-y-auto pr-0.5">
                {ROLES_LIST.map((item, index) => {
                  const Icon = item.icon;
                  const isSelected = userRole === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleRoleSelect(item.key as UserRole)}
                      className={`flex items-center justify-between p-2.5 sm:p-3 rounded-2xl border text-left transition-all cursor-pointer animate-magical-item ${
                        isSelected
                          ? 'bg-[#1c1c20] border-[#8a2432] shadow-sm ring-1 ring-[#8a2432]/60 text-foreground'
                          : 'bg-card/60 hover:bg-[#1c1c20] border-border text-muted-foreground hover:text-foreground'
                      }`}
                      style={{ animationDelay: `${80 + index * 70}ms` }}
                    >
                      <div className="flex items-center gap-3 min-w-0 pl-1">
                        <Icon className="h-5 w-5 text-[#f4a8b5] shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground truncate">{item.label}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{item.desc}</div>
                        </div>
                      </div>
                      
                      <div className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ml-2 transition-all ${
                        isSelected
                          ? 'bg-[#8a2432] border-[#8a2432] text-white'
                          : 'border-border bg-background'
                      }`}>
                        {isSelected && <Check className="h-2.5 w-2.5 text-white stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= STEP 4: Feature Highlights ================= */}
          {step === 4 && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {/* Dynamic Unified Feature Card (Sleek Compact 205px Fixed Height with Zero Dead Space) */}
              <div className="rounded-2xl border border-border bg-[#1c1c20] p-3.5 flex flex-col justify-between h-[208px] shadow-sm overflow-hidden">
                {/* Unified Card Header: Title & Status Badge (Guaranteed Single-Line) */}
                <div className="flex items-center justify-between pb-2 border-b border-border/60 shrink-0 gap-2">
                  <span className="text-xs font-bold text-foreground truncate">
                    {activeDemoTab === 'dining' && 'Birch Tree Inn & Campus Dining'}
                    {activeDemoTab === 'shuttles' && 'Campus Shuttles & Train Loops'}
                    {activeDemoTab === 'map' && 'Campus Map & Room Finder'}
                    {activeDemoTab === 'clubs' && 'Student Clubs & CSI Events'}
                  </span>
                  <span className="text-[10px] rounded-full bg-[#8a2432]/20 text-[#f4a8b5] px-2 py-0.5 border border-[#8a2432]/40 font-medium shrink-0">
                    {activeDemoTab === 'dining' && "Today's Menu"}
                    {activeDemoTab === 'shuttles' && 'Schedules'}
                    {activeDemoTab === 'map' && 'Campus Map'}
                    {activeDemoTab === 'clubs' && 'Event Schedules'}
                  </span>
                </div>

                {/* Card Body by Tab (Tight, Cohesive & Equalized) */}
                <div className="flex-1 flex flex-col justify-between pt-1.5">
                  {activeDemoTab === 'dining' && (
                    <>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        Daily station menus, meal swipe eligibility, dietary filters, and real-time cafe hours across campus.
                      </p>

                      {/* 2x2 Equalized Capability Grid */}
                      <div className="grid grid-cols-2 gap-1.5 py-0.5">
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-foreground inline-flex items-center gap-1.5 font-medium truncate">
                          <Utensils className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Daily Specials</span>
                        </span>
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-foreground inline-flex items-center gap-1.5 font-medium truncate">
                          <CreditCard className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Meal Swipes</span>
                        </span>
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-[#f4a8b5] inline-flex items-center gap-1.5 font-medium truncate">
                          <Leaf className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Vegan / Halal</span>
                        </span>
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-foreground inline-flex items-center gap-1.5 font-medium truncate">
                          <Coffee className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Campus Cafes</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs truncate">
                        <span className="text-muted-foreground shrink-0 text-[11px]">Try asking:</span>
                        <span className="font-medium text-[#f4a8b5] italic truncate">“yo what’s birch serving for lunch rn”</span>
                      </div>
                    </>
                  )}

                  {activeDemoTab === 'shuttles' && (
                    <>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        Upcoming departure schedules for train station loops, campus shuttles, and weekend mall trips.
                      </p>

                      {/* 2x2 Equalized Capability Grid */}
                      <div className="grid grid-cols-2 gap-1.5 py-0.5">
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-foreground inline-flex items-center gap-1.5 font-medium truncate">
                          <Train className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Train Station Loop</span>
                        </span>
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-foreground inline-flex items-center gap-1.5 font-medium truncate">
                          <Repeat className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Campus Loop</span>
                        </span>
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-foreground inline-flex items-center gap-1.5 font-medium truncate">
                          <ShoppingBag className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Weekend Mall Trips</span>
                        </span>
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-foreground inline-flex items-center gap-1.5 font-medium truncate">
                          <Clock className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Next Departures</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs truncate">
                        <span className="text-muted-foreground shrink-0 text-[11px]">Try asking:</span>
                        <span className="font-medium text-[#f4a8b5] italic truncate">“when does the next train shuttle pull up”</span>
                      </div>
                    </>
                  )}

                  {activeDemoTab === 'map' && (
                    <>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        Instant classroom navigation for any room code, academic wing, printer kiosk, or student parking lot.
                      </p>

                      {/* 2x2 Equalized Capability Grid */}
                      <div className="grid grid-cols-2 gap-1.5 py-0.5">
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-foreground inline-flex items-center gap-1.5 font-medium truncate">
                          <BookOpen className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Classrooms & Labs</span>
                        </span>
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-foreground inline-flex items-center gap-1.5 font-medium truncate">
                          <Building2 className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Student Center & CSI</span>
                        </span>
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-foreground inline-flex items-center gap-1.5 font-medium truncate">
                          <Printer className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Printer Locations</span>
                        </span>
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-foreground inline-flex items-center gap-1.5 font-medium truncate">
                          <Car className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Campus Parking</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs truncate">
                        <span className="text-muted-foreground shrink-0 text-[11px]">Try asking:</span>
                        <span className="font-medium text-[#f4a8b5] italic truncate">“how do i get to the csi office in the sc”</span>
                      </div>
                    </>
                  )}

                  {activeDemoTab === 'clubs' && (
                    <>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        Explore 100+ student clubs, Greek organizations, trivia nights, and upcoming semester activities.
                      </p>

                      {/* 2x2 Equalized Capability Grid */}
                      <div className="grid grid-cols-2 gap-1.5 py-0.5">
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-foreground inline-flex items-center gap-1.5 font-medium truncate">
                          <Code2 className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Academic & Tech</span>
                        </span>
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-foreground inline-flex items-center gap-1.5 font-medium truncate">
                          <Gamepad2 className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Sports & Esports</span>
                        </span>
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-[#8a2432]/20 border border-[#8a2432]/40 text-[#f4a8b5] inline-flex items-center gap-1.5 font-medium truncate">
                          <Gift className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Free Food Events</span>
                        </span>
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-card/80 border border-border text-foreground inline-flex items-center gap-1.5 font-medium truncate">
                          <Landmark className="h-3 w-3 text-[#f4a8b5] shrink-0" />
                          <span className="truncate">Greek Life & SGA</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs truncate">
                        <span className="text-muted-foreground shrink-0 text-[11px]">Try asking:</span>
                        <span className="font-medium text-[#f4a8b5] italic truncate">“any campus events with free food this week”</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Category Tabs Indicator (Clean Non-Clickable Guided Indicator) */}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {([
                  { key: 'dining', label: 'Dining', icon: Utensils },
                  { key: 'shuttles', label: 'Shuttles', icon: Bus },
                  { key: 'map', label: 'Map', icon: MapPin },
                  { key: 'clubs', label: 'Clubs', icon: Users },
                ] as const).map((tab, index) => {
                  const Icon = tab.icon;
                  const isActive = activeDemoTab === tab.key;
                  return (
                    <div
                      key={tab.key}
                      className={`relative flex flex-col items-center gap-1 py-1.5 px-1 rounded-xl text-xs font-medium transition-all select-none animate-magical-item ${
                        isActive
                          ? 'bg-[#1c1c20] text-foreground border border-border shadow-xs'
                          : 'text-muted-foreground/60 border border-transparent'
                      }`}
                      style={{ animationDelay: `${350 + index * 180}ms` }}
                    >
                      {isActive && (
                        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-[#f4a8b5]" />
                      )}
                      <Icon className="h-4 w-4 text-[#f4a8b5]" />
                      <span className="text-[11px]">{tab.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= STEP 5: Starter Questions ================= */}
          {step === 5 && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2">
                {(userRole ? ROLE_PROMPTS[userRole] : ROLE_PROMPTS.current_student).map((prompt, index) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleFinish(prompt)}
                    className="flex items-center justify-between rounded-2xl border border-border/80 bg-card/80 p-3.5 text-left text-xs font-medium text-muted-foreground hover:border-[#f4a8b5]/60 hover:bg-muted hover:text-foreground transition-all group cursor-pointer shadow-xs animate-magical-item"
                    style={{ animationDelay: `${80 + index * 70}ms` }}
                  >
                    <span className="leading-snug">{prompt}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-1 group-hover:text-foreground shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation & Progress Bar */}
        <div className="border-t border-border bg-card/40 shrink-0">
          {/* Sleek Animated Onboarding Progress Bar with Smooth Glide Physics */}
          <div className="relative h-1.5 w-full bg-black/50 overflow-hidden">
            <div
              className="relative h-full bg-gradient-to-r from-[#8a2432] via-[#d43f5e] to-[#f4a8b5] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-[0_0_12px_rgba(244,168,181,0.8)]"
              style={{ width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%` }}
            >
              {/* Glowing feathered leading edge beam */}
              <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-white via-white/80 to-transparent blur-[1px]" />
            </div>
          </div>

          <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
            {step > 1 || (step === 4 && activeDemoTab !== 'dining') ? (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1.5 rounded-xl bg-background border border-border px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>
            ) : (
              <span className="text-[10px] sm:text-[11px] font-bold tracking-wider text-[#f4a8b5] uppercase drop-shadow-[0_0_12px_rgba(244,168,181,0.7)] animate-pulse">
                NOT AFFILIATED WITH RAMAPO COLLEGE
              </span>
            )}

            {/* The story step keeps its deep-dive link beside the primary action */}
            {step === 2 && (
              <a
                href="/about?from=onboarding"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-background border border-border px-3 sm:px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer group"
              >
                <span>Learn more</span>
                <ExternalLink className="h-3.5 w-3.5 text-[#f4a8b5] transition-transform group-hover:translate-x-0.5" />
              </a>
            )}

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={handleContinue}
                disabled={step === 3 && !userRole}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-4 sm:px-5 py-2 text-xs font-semibold shadow-sm transition-all ${
                  step === 3 && !userRole
                    ? 'bg-[#4d161d]/25 text-white/35 border-[#8a2432]/20 cursor-not-allowed'
                    : 'bg-[#4d161d] hover:bg-[#631c26] text-white border-[#8a2432]/40 active:scale-[0.98] cursor-pointer'
                }`}
              >
                <span>{step === 4 && activeDemoTab !== 'clubs' ? 'Next' : 'Continue'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleFinish()}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#4d161d] hover:bg-[#631c26] text-white border border-[#8a2432]/40 px-4 sm:px-5 py-2 text-xs font-semibold shadow-sm transition-all active:scale-[0.98] cursor-pointer"
              >
                <span>Start Exploring 🚀</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
