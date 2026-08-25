import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type {
  Locomotive,
  Driver,
  Order,
  AssignmentWithDetails,
  Wagon,
  Company,
  Notification,
  CountryPackage,
} from '@/lib/supabase';
import {
  mergeWithSeed,
  mergeWagonsWithSeed,
  SEED_ASSIGNMENTS,
  SEED_COMPANY,
  SEED_DRIVERS,
  SEED_LOCOMOTIVES,
  SEED_NOTIFICATIONS,
  SEED_ORDERS,
  SEED_WAGONS,
} from '@/lib/seed';
import { OfficeHQView } from '@/views/OfficeHQView';
import { FleetView } from '@/views/FleetView';
import { WagonParkView } from '@/views/WagonParkView';
import { OrderMarketView } from '@/views/OrderMarketView';
import { DispatchView } from '@/views/DispatchView';
import { PersonnelView } from '@/views/PersonnelView';
import { FinanceView } from '@/views/FinanceView';
import { PcDashboardView } from '@/views/PcDashboardView';
import { InboxView } from '@/components/InboxView';
import { ContractsView } from '@/views/ContractsView';
import { CentralView } from '@/views/CentralView';
import { BankView } from '@/views/BankView';
import { AdvertisingView } from '@/views/AdvertisingView';
import { DealerView } from '@/views/DealerView';
import { PlayerMarketView } from '@/views/PlayerMarketView';
import { TourPlannerView, TourOverviewView } from '@/views/TourPlannerView';
import { BuildingsView } from '@/views/BuildingsView';
import { CompanyFoundingModal } from '@/components/CompanyFoundingModal';
import { HelpHandbookModal } from '@/components/HelpHandbookModal';
import { AchievementsGalleryModal } from '@/components/AchievementsGalleryModal';
import { LogoutConfirmModal } from '@/components/LogoutConfirmModal';
import { MainMenuScreen } from '@/components/MainMenuScreen';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { SectionPulseProvider } from '@/components/SectionShell';
import { Layout } from '@/layout/Layout';
import {
  applyProfileToCompany,
  loadCompanyProfile,
  saveCompanyProfile,
} from '@/lib/companyProfile';
import {
  applyCompletedJob,
  jobCompletionNotification,
  jobQueuedNotification,
  loadWagonJobs,
  loadWagonPatches,
  mergeWagonPatches,
  newWagonJobId,
  saveWagonJobs,
  saveWagonPatches,
  wagonPatchFrom,
  WAGON_JOB_RATES,
  type WagonJob,
  type WagonJobKind,
  type WagonPatch,
} from '@/lib/wagonJobs';
import { GameClockProvider } from '@/lib/GameClockContext';
import { atmosphereForView, type AppView } from '@/lib/navigation';
import {
  applyTickToAssignments,
  applyTickToDrivers,
  BASE_TICK_INTERVAL_MS,
  ersatzattestNotification,
  loadGameMinute,
  mergeDriverAfterFetch,
  MINUTES_PER_HOUR,
  newNotificationId,
  normalizeDriver,
  recoveryNotification,
  saveGameMinute,
  tickToDate,
  tickToIso,
  type ClockSpeed,
} from '@/lib/gameTime';
import {
  canChangeOverdraftLimit,
  canSpend,
  INSURANCE_CATALOG,
  isLoanAmountUnlocked,
  isOverdraftTierUnlocked,
  MAX_LOAN_PRINCIPAL,
  defaultOverdraftForLevel,
  loadBankState,
  loanDailyPayment,
  normalizeOverdraftLimit,
  overdraftRateForLimit,
  processBankTick,
  pushBooking,
  sanierungSnapshot,
  saveBankState,
  syncSanierung,
  type BankBookingKind,
  type BankState,
  type InsuranceId,
} from '@/lib/bank';
import {
  applyBekanntheit,
  isCampaignUnlocked,
  loadAdvertisingState,
  processAdvertisingTick,
  saveAdvertisingState,
  startCampaign,
  type AdvertisingState,
  type CampaignDef,
} from '@/lib/advertising';
import {
  acceptContract,
  buildContractRunOrder,
  canAcceptIndustrial,
  declineContract,
  industrialWagonNeed,
  loadFreightContracts,
  markContractRunDispatched,
  pendingContractOrders,
  processFreightContractsTick,
  requiredDeparturesFor,
  saveFreightContracts,
  type IndustrialContract,
} from '@/lib/freightContracts';
import {
  applyFreightPricing,
  isBaugleisEinsatz,
  isExpiredOpenOffer,
  loadPersistedOrders,
  loadMarketRefreshDay,
  marketRefreshDayKey,
  purgeExpiredOpenOrders,
  refreshMarketOrders,
  saveMarketRefreshDay,
  savePersistedOrders,
  standingFromCompany,
  isMarketRefreshAvailable,
} from '@/lib/orderMarket';
import {
  cancelBaugleisDeployment,
  hydrateDeploymentAssignments,
  loadBaugleisDeployments,
  processBaugleisDeploymentsTick,
  saveBaugleisDeployments,
  startBaugleisDeployment,
  type BaugleisDeployment,
} from '@/lib/baugleisDeployments';
import {
  buildPurchasedLoco,
  buildPurchasedWagons,
  DEALER_CATALOG_VERSION,
  DEFAULT_LOCO_ACQUIRE,
  ensureUsedStock,
  loadDealerState,
  loadExtraFleet,
  migrateDealerState,
  loadSoldAssets,
  LOCO_OFFERS,
  mergeFleet,
  nextLocoName,
  offerForLoco,
  processLeasesTick,
  quoteLocoPurchase,
  quoteWagonDeal,
  refreshUsedStockForOffer,
  saveDealerState,
  saveExtraFleet,
  saveSoldAssets,
  usedStockFor,
  WAGON_OFFERS,
  wagonOfferByTypeCode,
  type Acquisition,
  type DealerState,
  type ExtraFleet,
  type LocoAcquireOptions,
  type SoldAssets,
} from '@/lib/dealer';
import {
  applyLocoFault,
  applyLocoMaintPatches,
  canBookWorkshopJob,
  completeWorkshopJob,
  ensureMaintenance,
  isHuValid,
  isLocoDeployable,
  syncLocoStatus,
  jobLabel,
  loadLocoMaintPatches,
  loadWorkshopJobs,
  patchFromLoco,
  processMaintenanceDay,
  quoteWorkshopJob,
  saveLocoMaintPatches,
  saveWorkshopJobs,
  usedWorkshopSlots,
  type LocoMaintPatch,
  type WorkshopChannel,
  type WorkshopJob,
  type WorkshopJobKind,
} from '@/lib/workshop';
import {
  canBuyDepotExpansion,
  DEPOT_EXPANSIONS,
  ensureDepotFits,
  loadDepotState,
  locoBerthCap,
  purchaseDepotExpansion,
  saveDepotState,
  wagonBerthCap,
  wagonUnitCount,
  freeWagonBerths,
  workshopSlotCap,
  type DepotState,
} from '@/lib/depot';
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENTS,
  achievementCount,
  applyCashReward,
  loadAchievementState,
  noteCompletedTrip,
  noteLoanTaken,
  noteLoansPaidOff,
  noteStarterExpired,
  noteStarterMiss,
  noteUnplannedFault,
  noteWorkshopMaintenances,
  rewardLabel,
  saveAchievementState,
  unlockAchievements,
  workshopDiscountPct,
  type AchievementState,
  type AchievementWorld,
} from '@/lib/achievements';
import { isNewGameDay } from '@/lib/storage';
import {
  buildRecruit,
  completeDueTraining,
  ensureDailyJobBoard,
  ensureStaffMeta,
  grantCrewExperience,
  listingAsOffer,
  listingToStaffMeta,
  loadExtraDrivers,
  loadStaffMeta,
  processPayrollTick,
  removeJobListing,
  saveExtraDrivers,
  saveStaffMeta,
  type JobListing,
  type StaffMeta,
} from '@/lib/jobcenter';
import {
  composeTripDelay,
  hireNachschulungFee,
  missingFleetSeries,
  seriesDispatchBlock,
  seriesTrainingQuote,
} from '@/lib/personal';
import { applyEconomy, loadCompanyEconomy, saveCompanyEconomy } from '@/lib/economy';
import { computeDailyFixedCosts, processDepotTick } from '@/lib/dailyFixedCosts';
import { calcOrderOperatingCosts } from '@/lib/operatingCosts';
import { autoAzfChoice, isBaugleisOrder, pdlAzfDailyRate } from '@/lib/pdl';
import { grandfatherAktivTrips, loadChargedTripIds, markTripCharged, saveChargedTripIds } from '@/lib/tripCosts';
import { formatEuro } from '@/lib/status';
import { BEKANNTHEIT_PER_LEVEL, grantCompanyXp, xpForCompletedOrder } from '@/lib/progression';
import { isAssignmentArrived } from '@/lib/tracking';
import {
  checkWagonAvailability,
  occupyWagonPacks,
  pickWagonPacksForOrder,
  releaseWagonPacks,
  releaseWagonPacksByNeed,
} from '@/lib/brh';
import { hasSeenTutorial, markTutorialSeen } from '@/lib/tutorial';
import { isSessionActive, setSessionActive } from '@/lib/session';
import { driverRestStatus, resolveRestTripRisk, REST_WARNING } from '@/lib/restRules';
import {
  countryPackageLabel,
  countryPackagePrice,
  grantNetworkPackages,
  loadNetworkAccess,
  missingNetworkCountries,
  locoHasEtcs,
  networkAcceptBlock,
  networkDispatchBlock,
  saveNetworkAccess,
  type NetworkAccessState,
} from '@/lib/networkAccess';
import {
  closureBlockMessage,
  loadWorldEvents,
  orderBlockedByClosure,
  processWorldEventsTick,
  saveWorldEvents,
  type WorldEventState,
} from '@/lib/events';
import {
  deleteMessage,
  deleteReadMessages,
  markAllMessagesRead,
  markMessageRead,
  seedWelcomeInbox,
  sendMessage,
  subscribeInbox,
  unreadInboxCount,
  type Message,
} from '@/lib/inbox';
import {
  acceptHireRequest,
  declineHireRequest,
  isWagonRented,
  loadRentalState,
  processRentalTick,
  saveRentalState,
  startWagonRental,
  type RentalState,
  type RentalTermMonths,
} from '@/lib/rental';

type View = AppView;

function persistQuietly(task: PromiseLike<unknown>) {
  void Promise.resolve(task).catch(() => {});
}

function App() {
  const [view, setView] = useState<View>('zentrale');
  const [locomotives, setLocomotives] = useState<Locomotive[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([]);
  const [wagons, setWagons] = useState<Wagon[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [inbox, setInbox] = useState<Message[]>(() => seedWelcomeInbox(0));
  const [loading, setLoading] = useState(true);
  const [dispoPreselect, setDispoPreselect] = useState<Order | null>(null);
  const [dealerPrefill, setDealerPrefill] = useState<{ typeCode: string; qty: number } | null>(null);
  const [clockRunning, setClockRunning] = useState(false);
  const [clockSpeed, setClockSpeed] = useState<ClockSpeed>(1);
  const [clockMinutes, setClockMinutes] = useState(() => loadGameMinute());
  const [foundingOpen, setFoundingOpen] = useState(false);
  const [foundingMode, setFoundingMode] = useState<'found' | 'edit'>('found');
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialEpoch, setTutorialEpoch] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [atMainMenu, setAtMainMenu] = useState(() => !isSessionActive());
  const [wagonJobs, setWagonJobs] = useState<WagonJob[]>(() => loadWagonJobs());
  const [bank, setBank] = useState<BankState>(() =>
    loadBankState(SEED_COMPANY.tick, SEED_COMPANY.balance, SEED_COMPANY.updated_at),
  );
  const [ads, setAds] = useState<AdvertisingState>(() => loadAdvertisingState());
  const [industrial, setIndustrial] = useState<IndustrialContract[]>(() => loadFreightContracts());
  const [dealer, setDealer] = useState<DealerState>(() =>
    loadDealerState(loadCompanyEconomy()?.lastTick ?? SEED_COMPANY.tick),
  );
  const [workshopJobs, setWorkshopJobs] = useState<WorkshopJob[]>(() => loadWorkshopJobs());
  const [staffMeta, setStaffMeta] = useState<Record<string, StaffMeta>>(() => loadStaffMeta());
  const [jobListings, setJobListings] = useState<JobListing[]>(() =>
    ensureDailyJobBoard(
      SEED_COMPANY.tick,
      loadGameMinute(),
      SEED_DRIVERS.map((d) => d.name),
    ),
  );
  const [rentals, setRentals] = useState<RentalState>(() => loadRentalState(SEED_COMPANY.tick));
  const [deployments, setDeployments] = useState<BaugleisDeployment[]>(() => loadBaugleisDeployments());
  const [depot, setDepot] = useState<DepotState>(() => loadDepotState());
  const [insolvencyDismissed, setInsolvencyDismissed] = useState(false);
  const [networkAccess, setNetworkAccess] = useState<NetworkAccessState>(() => loadNetworkAccess());
  const [worldEvents, setWorldEvents] = useState<WorldEventState>(() =>
    loadWorldEvents(loadCompanyEconomy()?.lastTick ?? SEED_COMPANY.tick),
  );
  const [dealerNetworkHighlight, setDealerNetworkHighlight] = useState<CountryPackage | null>(null);
  const [marketRefreshDay, setMarketRefreshDay] = useState<string | null>(() => loadMarketRefreshDay());
  const [achievements, setAchievements] = useState<AchievementState>(() => loadAchievementState());
  const [galleryOpen, setGalleryOpen] = useState(false);

  const headerRef = useRef<HTMLElement | null>(null);
  const companyRef = useRef(company);
  const driversRef = useRef(drivers);
  const assignmentsRef = useRef(assignments);
  const wagonsRef = useRef(wagons);
  const locomotivesRef = useRef(locomotives);
  const wagonJobsRef = useRef(wagonJobs);
  const wagonPatchesRef = useRef<Record<string, WagonPatch>>(loadWagonPatches());
  const extraFleetRef = useRef<ExtraFleet>(loadExtraFleet());
  const soldAssetsRef = useRef<SoldAssets>(loadSoldAssets());
  const locoMaintRef = useRef<Record<string, LocoMaintPatch>>(loadLocoMaintPatches());
  const extraDriversRef = useRef<Driver[]>(loadExtraDrivers());
  const bankRef = useRef(bank);
  const adsRef = useRef(ads);
  const industrialRef = useRef(industrial);
  const dealerRef = useRef(dealer);
  const workshopRef = useRef(workshopJobs);
  const staffMetaRef = useRef(staffMeta);
  const rentalsRef = useRef(rentals);
  const deploymentsRef = useRef(deployments);
  const depotRef = useRef(depot);
  const chargedTripsRef = useRef<string[]>(loadChargedTripIds());
  const ordersRef = useRef(orders);
  const networkRef = useRef(networkAccess);
  const eventsRef = useRef(worldEvents);
  const achievementsRef = useRef(achievements);

  companyRef.current = company;
  driversRef.current = drivers;
  assignmentsRef.current = assignments;
  wagonsRef.current = wagons;
  locomotivesRef.current = locomotives;
  wagonJobsRef.current = wagonJobs;
  bankRef.current = bank;
  adsRef.current = ads;
  industrialRef.current = industrial;
  dealerRef.current = dealer;
  workshopRef.current = workshopJobs;
  staffMetaRef.current = staffMeta;
  rentalsRef.current = rentals;
  deploymentsRef.current = deployments;
  depotRef.current = depot;
  ordersRef.current = orders;
  networkRef.current = networkAccess;
  eventsRef.current = worldEvents;
  achievementsRef.current = achievements;

  const tick = company?.tick ?? 0;
  const gameNow = useMemo(() => tickToDate(tick, clockMinutes), [tick, clockMinutes]);
  const clockMinutesRef = useRef(clockMinutes);
  clockMinutesRef.current = clockMinutes;

  useEffect(() => {
    setJobListings(ensureDailyJobBoard(tick, clockMinutes, drivers.map((d) => d.name)));
  }, [tick, clockMinutes, drivers]);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => {
      document.documentElement.style.setProperty('--app-header-h', `${el.offsetHeight}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  useEffect(() => {
    if (view !== 'haendler') setDealerPrefill(null);
  }, [view]);

  const pushNotifications = useCallback((items: Omit<Notification, 'id'>[]) => {
    if (items.length === 0) return;
    const full: Notification[] = items.map((item) => ({ ...item, id: newNotificationId() }));
    setNotifications((prev) => [...full, ...prev]);
    if (!isSupabaseConfigured) return;
    persistQuietly(supabase.from('notifications').insert(full));
  }, []);

  const persistCompany = useCallback((next: Company) => {
    const prev = companyRef.current;
    if (prev) {
      if (prev.balance >= 0 && next.balance < 0) {
        sendMessage(
          'Warnung',
          'Konto im Minus',
          `Die Bank meldet einen negativen Kontostand von ${formatEuro(next.balance)}. Dispozinsen laufen — bitte Liquidität sichern.`,
          next.tick,
        );
      }
      if (next.level > prev.level) {
        for (let lvl = prev.level + 1; lvl <= next.level; lvl += 1) {
          sendMessage(
            'System',
            'Level Up!',
            `EVU-Level ${lvl}: +${BEKANNTHEIT_PER_LEVEL} Bekanntheit, höherer Dispo-Rahmen.`,
            next.tick,
          );
        }
      }
    }
    companyRef.current = next;
    setCompany(next);
    saveCompanyEconomy({ balance: next.balance, reputation: next.reputation, lastTick: next.tick });
    if (!isSupabaseConfigured) return;
    persistQuietly(
      supabase
        .from('company')
        .update({
          balance: next.balance,
          reputation: next.reputation,
          level: next.level,
          xp: next.xp,
          xp_next: next.xp_next,
          tick: next.tick,
          updated_at: next.updated_at,
        })
        .eq('id', next.id),
    );
  }, []);

  const persistDepot = useCallback((next: DepotState) => {
    depotRef.current = next;
    setDepot(next);
    saveDepotState(next);
  }, []);

  useEffect(() => subscribeInbox(setInbox), []);

  const persistBank = useCallback((next: BankState) => {
    bankRef.current = next;
    setBank(next);
    saveBankState(next);
  }, []);

  useEffect(() => {
    if (loading) return;
    const fitted = ensureDepotFits(
      depotRef.current,
      locomotivesRef.current.length,
      wagonUnitCount(wagonsRef.current),
      usedWorkshopSlots(workshopRef.current, companyRef.current?.tick ?? 0),
    );
    if (fitted.purchasedIds.join('|') !== depotRef.current.purchasedIds.join('|')) {
      persistDepot(fitted);
    }
  }, [loading, locomotives.length, wagons, persistDepot]);

  useEffect(() => {
    if (loading || !company) return;
    if (!canChangeOverdraftLimit(company.balance)) return;
    const cap = defaultOverdraftForLevel(company.level);
    if (cap <= bankRef.current.overdraftLimit) return;
    persistBank({
      ...bankRef.current,
      overdraftLimit: cap,
      overdraftDailyRate: overdraftRateForLimit(cap),
    });
  }, [loading, company?.level, persistBank]);

  useEffect(() => {
    if (loading || !company) return;
    const result = syncSanierung(bankRef.current, company.balance, company.tick, company.updated_at);
    if (result.changed) persistBank(result.state);
    pushNotifications(result.notifications);
    if (result.failed || result.state.insolvent) setClockRunning(false);
  }, [loading, company?.balance, company?.tick, bank.overdraftLimit, persistBank, pushNotifications]);

  const persistRentals = useCallback((next: RentalState) => {
    rentalsRef.current = next;
    setRentals(next);
    saveRentalState(next);
  }, []);

  const persistLocoFleet = useCallback((locos: Locomotive[]) => {
    locomotivesRef.current = locos;
    setLocomotives(locos);
    const patches = { ...locoMaintRef.current };
    for (const loco of locos) {
      const patch = patchFromLoco(loco);
      if (patch) patches[loco.id] = patch;
    }
    locoMaintRef.current = patches;
    saveLocoMaintPatches(patches);
    extraFleetRef.current = {
      ...extraFleetRef.current,
      locomotives: extraFleetRef.current.locomotives.map((loco) => locos.find((l) => l.id === loco.id) ?? loco),
    };
    saveExtraFleet(extraFleetRef.current);
  }, []);

  const book = useCallback(
    (label: string, amount: number, atTick?: number, kind?: BankBookingKind) => {
      const current = companyRef.current;
      const t = atTick ?? current?.tick ?? 0;
      persistBank(
        pushBooking(bankRef.current, {
          tick: t,
          createdAt: tickToIso(t),
          label,
          amount,
          kind,
        }),
      );
    },
    [persistBank],
  );

  const persistAchievements = useCallback((next: AchievementState) => {
    achievementsRef.current = next;
    setAchievements(next);
    saveAchievementState(next);
  }, []);

  const achievementWorldFor = useCallback((companyNow: Company): AchievementWorld => {
    return {
      tick: companyNow.tick,
      balance: companyNow.balance,
      overdraftLimit: bankRef.current.overdraftLimit,
      reputation: companyNow.reputation,
      level: companyNow.level,
      locos: locomotivesRef.current,
      leasedLocoIds: dealerRef.current.leases.filter((lease) => lease.kind === 'loco').map((lease) => lease.assetId),
      staffCount: driversRef.current.length,
      depot: depotRef.current,
      counters: achievementsRef.current.counters,
    };
  }, []);

  const grantAchievements = useCallback(
    (companyNow: Company, atTick?: number): Company => {
      const tickNow = atTick ?? companyNow.tick;
      const result = unlockAchievements(achievementsRef.current, achievementWorldFor(companyNow), tickNow);
      if (result.unlocked.length === 0) return companyNow;
      persistAchievements(result.state);
      const next = applyCashReward(companyNow, result.cashDelta);
      for (const def of result.unlocked) {
        if (def.reward.kind === 'cash') {
          book(`Meilenstein: ${def.name}`, def.reward.amount, tickNow, 'sonstiges');
        }
        sendMessage(
          'System',
          `Meilenstein: ${def.name}`,
          `${def.condition} Bonus: ${rewardLabel(def.reward, true)}`,
          tickNow,
        );
      }
      pushNotifications(
        result.unlocked.map((def) => ({
          type: 'success' as const,
          title: `Meilenstein: ${def.name}`,
          message: rewardLabel(def.reward, true),
          read: false,
          created_at: tickToIso(tickNow),
        })),
      );
      return next;
    },
    [achievementWorldFor, book, persistAchievements, pushNotifications],
  );

  const debitSpotTripCosts = useCallback(
    (assignment: AssignmentWithDetails, companyNow: Company, atTick: number): Company => {
      const order = assignment.order;
      if (!order || isBaugleisEinsatz(order)) return companyNow;
      if (chargedTripsRef.current.includes(assignment.id)) return companyNow;
      const fuel =
        assignment.locomotive?.fuel_type ??
        locomotivesRef.current.find((l) => l.id === assignment.locomotive_id)?.fuel_type ??
        'diesel';
      const costs = calcOrderOperatingCosts(
        order,
        fuel,
        assignment.pdl_azf_daily && assignment.pdl_azf_daily > 0 ? 'pdl' : 'eigen',
      );
      chargedTripsRef.current = markTripCharged(chargedTripsRef.current, assignment.id);
      if (costs.total <= 0) return companyNow;
      const pathEnergy = costs.pathCost + costs.energyCost;
      if (pathEnergy > 0) book(`Trasse/Energie ${order.order_number}`, -pathEnergy, atTick, 'betrieb');
      if (costs.pdlCost > 0) {
        book(`PDL AZF/RB ${order.order_number}`, -costs.pdlCost, atTick, 'betrieb');
      }
      return { ...companyNow, balance: companyNow.balance - costs.total };
    },
    [book],
  );

  const localSeededRef = useRef(false);

  const applyStarterFallback = useCallback(() => {
    const extra = extraFleetRef.current;
    const sold = soldAssetsRef.current;
    setLocomotives(
      applyLocoMaintPatches(mergeFleet(SEED_LOCOMOTIVES, extra.locomotives, sold.locomotives), locoMaintRef.current),
    );
    const extras = extraDriversRef.current.map(normalizeDriver);
    const seedDrivers = SEED_DRIVERS.map(normalizeDriver);
    const seedIds = new Set(seedDrivers.map((d) => d.id));
    const allDrivers = [...seedDrivers, ...extras.filter((d) => !seedIds.has(d.id))];
    setDrivers(allDrivers);
    setStaffMeta((prev) => {
      const next = ensureStaffMeta(allDrivers, prev);
      staffMetaRef.current = next;
      saveStaffMeta(next);
      return next;
    });
    setWagons(mergeWagonPatches(mergeFleet(SEED_WAGONS, extra.wagons, sold.wagons), wagonPatchesRef.current));
    const seeded = applyProfileToCompany(SEED_COMPANY, loadCompanyProfile());
    const nextCompany = applyEconomy(seeded, loadCompanyEconomy());
    setCompany(nextCompany);
    setNotifications(SEED_NOTIFICATIONS);
    const gameNowAtLoad = tickToDate(nextCompany.tick);
    const persisted = loadPersistedOrders(gameNowAtLoad, standingFromCompany(nextCompany));
    const marketRaw =
      persisted && persisted.length > 0
        ? persisted
        : refreshMarketOrders(SEED_ORDERS, nextCompany.tick, standingFromCompany(nextCompany));
    const market = purgeExpiredOpenOrders(marketRaw, gameNowAtLoad);
    const hydrated = hydrateDeploymentAssignments(
      deploymentsRef.current,
      market,
      applyLocoMaintPatches(mergeFleet(SEED_LOCOMOTIVES, extra.locomotives, sold.locomotives), locoMaintRef.current),
      allDrivers,
      SEED_ASSIGNMENTS,
    );
    setOrders(hydrated.orders);
    setAssignments(hydrated.assignments);
    setLocomotives(hydrated.locomotives);
    setDrivers(hydrated.drivers);
    deploymentsRef.current = hydrated.deployments;
    setDeployments(hydrated.deployments);
    driversRef.current = hydrated.drivers;
    assignmentsRef.current = hydrated.assignments;
    savePersistedOrders(hydrated.orders);
    chargedTripsRef.current = grandfatherAktivTrips(
      hydrated.assignments.filter((a) => a.status === 'aktiv').map((a) => a.id),
    );
    localSeededRef.current = true;
  }, []);

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      try {
        if (!localSeededRef.current) applyStarterFallback();
      } catch {
        /* keep empty local state rather than white-screening */
      }
      setLoading(false);
      return;
    }

    try {
      const extra = extraFleetRef.current;
      const sold = soldAssetsRef.current;
      const [locoRes, driverRes, orderRes, assignRes, wagonRes, companyRes, notifRes] = await Promise.all([
        supabase.from('locomotives').select('*').order('designation'),
        supabase.from('drivers').select('*').order('name'),
        supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase
          .from('assignments')
          .select('*, order:orders(*), locomotive:locomotives(*), driver:drivers(*)')
          .order('assigned_at', { ascending: false }),
        supabase.from('wagons').select('*').order('category, type_code, status'),
        supabase.from('company').select('*').eq('id', 1).maybeSingle(),
        supabase.from('notifications').select('*').order('created_at', { ascending: false }),
      ]);

      setLocomotives(
        applyLocoMaintPatches(
          mergeFleet(
            mergeWithSeed(locoRes.data as Locomotive[] | null, SEED_LOCOMOTIVES, 'name'),
            extra.locomotives,
            sold.locomotives,
          ),
          locoMaintRef.current,
        ),
      );
      const remoteDrivers = mergeWithSeed(driverRes.data as Driver[] | null, SEED_DRIVERS, 'name');
      const localDrivers = driversRef.current;
      const merged = remoteDrivers.map((remote) =>
        mergeDriverAfterFetch(
          remote,
          localDrivers.find((d) => d.id === remote.id),
        ),
      );
      const extraDrivers = extraDriversRef.current.map(normalizeDriver);
      const known = new Set(merged.map((d) => d.id));
      const allDrivers = [...merged, ...extraDrivers.filter((d) => !known.has(d.id))];
      setDrivers(allDrivers);
      setStaffMeta((prev) => {
        const next = ensureStaffMeta(allDrivers, prev);
        staffMetaRef.current = next;
        saveStaffMeta(next);
        return next;
      });
      const remoteCompany = (companyRes.data as Company | null) ?? SEED_COMPANY;
      const standing = standingFromCompany(remoteCompany);
      const mergedOrders = mergeWithSeed(orderRes.data as Order[] | null, SEED_ORDERS, 'order_number').map((order) =>
        order.status === 'offen' ? applyFreightPricing(order, standing) : order,
      );
      const remoteTick = remoteCompany.tick ?? companyRef.current?.tick ?? 0;
      setOrders(purgeExpiredOpenOrders(mergedOrders, tickToDate(remoteTick)));
      const remoteAssign = (assignRes.data as AssignmentWithDetails[] | null) ?? [];
      setAssignments(remoteAssign);
      chargedTripsRef.current = grandfatherAktivTrips(
        remoteAssign.filter((a) => a.status === 'aktiv').map((a) => a.id),
      );
      setWagons(
        mergeWagonPatches(
          mergeFleet(mergeWagonsWithSeed(wagonRes.data as Wagon[] | null, SEED_WAGONS), extra.wagons, sold.wagons),
          wagonPatchesRef.current,
        ),
      );
      setCompany((prev) => {
        const withTick =
          prev && prev.tick > remoteCompany.tick ? { ...remoteCompany, tick: prev.tick } : remoteCompany;
        return applyEconomy(applyProfileToCompany(withTick, loadCompanyProfile()), loadCompanyEconomy());
      });
      setNotifications(
        notifRes.data && notifRes.data.length > 0 ? (notifRes.data as Notification[]) : SEED_NOTIFICATIONS,
      );
    } catch {
      applyStarterFallback();
    } finally {
      setLoading(false);
    }
  }, [applyStarterFallback]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const nowTick = company?.tick ?? loadCompanyEconomy()?.lastTick ?? SEED_COMPANY.tick;
    if ((dealer.catalogVersion ?? 0) === DEALER_CATALOG_VERSION) return;
    const migrated = migrateDealerState(dealer, nowTick);
    dealerRef.current = migrated;
    setDealer(migrated);
    saveDealerState(migrated);
  }, [company?.tick, dealer]);

  useEffect(() => {
    if (loading) return;
    if (orders.length > 0) savePersistedOrders(orders);
  }, [orders, loading]);

  const cleanupExpiredOpenOffers = useCallback(() => {
    const now = tickToDate(companyRef.current?.tick ?? 0);
    setOrders((prev) => {
      const next = purgeExpiredOpenOrders(prev, now);
      if (next === prev) return prev;
      ordersRef.current = next;
      savePersistedOrders(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (loading || view !== 'auftragsmarkt') return;
    cleanupExpiredOpenOffers();
  }, [view, loading, cleanupExpiredOpenOffers]);

  useEffect(() => {
    if (loading || atMainMenu) return;
    if (!loadCompanyProfile()) {
      setFoundingMode('found');
      setFoundingOpen(true);
    }
  }, [loading, atMainMenu]);

  useEffect(() => {
    if (loading || foundingOpen || atMainMenu) return;
    if (!hasSeenTutorial()) setTutorialOpen(true);
  }, [loading, foundingOpen, atMainMenu]);

  useEffect(() => {
    if (tutorialOpen || helpOpen || logoutOpen || atMainMenu) setClockRunning(false);
  }, [tutorialOpen, helpOpen, logoutOpen, atMainMenu]);

  const persistWagonFields = useCallback((wagon: Wagon) => {
    if (!isSupabaseConfigured) return;
    persistQuietly(
      supabase
        .from('wagons')
        .update({
          status: wagon.status,
          frist_level: wagon.frist_level,
          frist_date: wagon.frist_date,
        })
        .eq('id', wagon.id),
    );
  }, []);

  const patchWagonState = useCallback(
    (updated: Wagon) => {
      wagonPatchesRef.current = { ...wagonPatchesRef.current, [updated.id]: wagonPatchFrom(updated) };
      saveWagonPatches(wagonPatchesRef.current);
      const next = wagonsRef.current.map((w) => (w.id === updated.id ? updated : w));
      wagonsRef.current = next;
      setWagons(next);
      persistWagonFields(updated);
    },
    [persistWagonFields],
  );

  const applyWagonFleet = useCallback(
    (next: Wagon[]) => {
      const prev = new Map(wagonsRef.current.map((w) => [w.id, w]));
      const patches = { ...wagonPatchesRef.current };
      for (const wagon of next) {
        const before = prev.get(wagon.id);
        if (!before || before.status !== wagon.status || before.count !== wagon.count) {
          patches[wagon.id] = wagonPatchFrom(wagon);
          persistWagonFields(wagon);
        }
      }
      wagonPatchesRef.current = patches;
      saveWagonPatches(patches);
      wagonsRef.current = next;
      setWagons(next);
    },
    [persistWagonFields],
  );

  const releaseAssignmentWagons = useCallback(
    (a: AssignmentWithDetails) => {
      const ids = a.wagon_pack_ids;
      const next =
        ids && ids.length > 0
          ? releaseWagonPacks(wagonsRef.current, ids)
          : releaseWagonPacksByNeed(a.order, wagonsRef.current);
      if (next !== wagonsRef.current) applyWagonFleet(next);
    },
    [applyWagonFleet],
  );

  const completeDueWagonJobs = useCallback(
    (atTick: number) => {
      const due = wagonJobsRef.current.filter((job) => job.completeAtTick <= atTick);
      if (due.length === 0) return;
      const remaining = wagonJobsRef.current.filter((job) => job.completeAtTick > atTick);
      wagonJobsRef.current = remaining;
      setWagonJobs(remaining);
      saveWagonJobs(remaining);

      const now = tickToDate(atTick);
      const gameNowIso = tickToIso(atTick);
      const notifs: Omit<Notification, 'id'>[] = [];
      for (const job of due) {
        const wagon = wagonsRef.current.find((w) => w.id === job.wagonId);
        if (!wagon) continue;
        const updated = applyCompletedJob(wagon, job.kind, now);
        patchWagonState(updated);
        notifs.push(jobCompletionNotification(updated, job.kind, gameNowIso));
      }
      pushNotifications(notifs);
    },
    [patchWagonState, pushNotifications],
  );

  const completeDueWorkshopJobs = useCallback(
    (atTick: number) => {
      const due = workshopRef.current.filter((job) => job.completeAtTick <= atTick);
      if (due.length === 0) return;
      const remaining = workshopRef.current.filter((job) => job.completeAtTick > atTick);
      workshopRef.current = remaining;
      setWorkshopJobs(remaining);
      saveWorkshopJobs(remaining);
      const date = tickToIso(atTick).slice(0, 10);
      const locos = locomotivesRef.current.map((loco) => {
        const job = due.find((j) => j.locoId === loco.id);
        return job ? completeWorkshopJob(loco, job.kind, date) : loco;
      });
      persistLocoFleet(locos);
      const maintDone = due.filter((job) => job.kind === 'F' || job.kind === 'ZU' || job.kind === 'HU').length;
      if (maintDone > 0) {
        persistAchievements(noteWorkshopMaintenances(achievementsRef.current, maintDone));
      }
      pushNotifications(
        due.map((job) => ({
          type: 'success' as const,
          title: 'Werkstatt fertig',
          message: `${jobLabel(job)} abgeschlossen.`,
          read: false,
          created_at: tickToIso(atTick),
        })),
      );
    },
    [persistLocoFleet, persistAchievements, pushNotifications],
  );

  useEffect(() => {
    if (loading) return;
    completeDueWagonJobs(companyRef.current?.tick ?? 0);
    completeDueWorkshopJobs(companyRef.current?.tick ?? 0);
  }, [loading, completeDueWagonJobs, completeDueWorkshopJobs]);

  useEffect(() => {
    if (loading || !companyRef.current) return;
    const next = grantAchievements(companyRef.current);
    if (next !== companyRef.current) persistCompany(next);
  }, [loading, grantAchievements, persistCompany]);

  const trySpend = useCallback(
    (amount: number, label: string, kind?: BankBookingKind): boolean => {
      const current = companyRef.current;
      if (!current) return false;
      if (!canSpend(current.balance, amount, bankRef.current.overdraftLimit)) {
        pushNotifications([
          {
            type: 'warning',
            title: 'Zahlung abgelehnt',
            message: `Unzureichende Mittel für ${label} (${formatEuro(amount)}).`,
            read: false,
            created_at: tickToIso(current.tick),
          },
        ]);
        return false;
      }
      persistCompany({ ...current, balance: current.balance - amount });
      book(label, -amount, undefined, kind);
      return true;
    },
    [book, persistCompany, pushNotifications],
  );

  const advanceOneTick = useCallback(() => {
    const prevCompany = companyRef.current;
    if (!prevCompany) return;

    const nextTick = prevCompany.tick + 1;
    const gameNowIso = tickToIso(nextTick);
    let nextCompany: Company = { ...prevCompany, tick: nextTick, updated_at: gameNowIso };

    const prevDrivers = driversRef.current;
    const { drivers: tickedDrivers, recovered } = applyTickToDrivers(prevDrivers, gameNowIso);
    let nextDrivers = tickedDrivers;

    const trained = completeDueTraining(nextDrivers, staffMetaRef.current, nextTick);
    nextDrivers = trained.drivers;
    if (trained.meta !== staffMetaRef.current) {
      staffMetaRef.current = trained.meta;
      setStaffMeta(trained.meta);
      saveStaffMeta(trained.meta);
    }

    driversRef.current = nextDrivers;
    setDrivers(nextDrivers);

    const { assignments: nextAssignments, activatedIds } = applyTickToAssignments(assignmentsRef.current);
    assignmentsRef.current = nextAssignments;
    setAssignments(nextAssignments);
    for (const id of activatedIds) {
      const started = nextAssignments.find((a) => a.id === id);
      if (started) nextCompany = debitSpotTripCosts(started, nextCompany, nextTick);
    }

    if (recovered.length > 0) {
      pushNotifications(recovered.map(({ driver, previousStatus }) => recoveryNotification(driver, previousStatus)));
    }

    completeDueWagonJobs(nextTick);
    completeDueWorkshopJobs(nextTick);

    if (isNewGameDay(prevCompany.tick, nextTick)) {
      const maint = processMaintenanceDay(
        locomotivesRef.current,
        assignmentsRef.current,
        workshopRef.current,
        nextTick,
        nextCompany.level ?? 1,
      );
      if (maint.changed) persistLocoFleet(maint.locos);
      pushNotifications(maint.notifications);
      if (maint.unplannedFaults > 0) {
        persistAchievements(noteUnplannedFault(achievementsRef.current, nextTick));
      }
      const restock = ensureUsedStock(dealerRef.current, nextTick);
      if (restock !== dealerRef.current) {
        dealerRef.current = restock;
        setDealer(restock);
        saveDealerState(restock);
      }
    }

    const loansBefore = (bankRef.current.loans ?? []).length;
    const bankTick = processBankTick(bankRef.current, nextCompany, nextTick);
    nextCompany = bankTick.company;
    persistBank(bankTick.state);
    pushNotifications(bankTick.notifications);
    const loansPaid = loansBefore - (bankTick.state.loans ?? []).length;
    if (loansPaid > 0) {
      persistAchievements(noteLoansPaidOff(achievementsRef.current, loansPaid));
    }

    const adTick = processAdvertisingTick(adsRef.current, nextCompany, nextTick);
    adsRef.current = adTick.state;
    setAds(adTick.state);
    saveAdvertisingState(adTick.state);
    pushNotifications(adTick.notifications);

    const beforeContracts = nextCompany.balance;
    const contractTick = processFreightContractsTick(
      industrialRef.current,
      nextCompany,
      prevCompany.tick,
      nextTick,
      assignmentsRef.current,
    );
    nextCompany = contractTick.company;
    industrialRef.current = contractTick.list;
    setIndustrial(contractTick.list);
    saveFreightContracts(contractTick.list);
    pushNotifications(contractTick.notifications);
    for (const row of contractTick.daySettlements) {
      persistAchievements(noteStarterMiss(achievementsRef.current, row.id, row.missed));
    }
    for (const id of contractTick.expiredIds) {
      persistAchievements(noteStarterExpired(achievementsRef.current, id));
    }
    if (nextCompany.balance !== beforeContracts) {
      book(
        nextCompany.balance < beforeContracts ? 'Vertragsstrafe Rahmenvertrag' : 'Industrie-Frachtverträge',
        nextCompany.balance - beforeContracts,
        nextTick,
        nextCompany.balance < beforeContracts ? 'strafe' : 'fracht',
      );
    }

    const beforeLease = nextCompany.balance;
    const leaseTick = processLeasesTick(dealerRef.current, nextCompany, prevCompany.tick, nextTick);
    nextCompany = leaseTick.company;
    if (nextCompany.balance !== beforeLease) {
      book('Leasingraten', nextCompany.balance - beforeLease, nextTick, 'leasing');
    }

    const beforePay = nextCompany.balance;
    const pay = processPayrollTick(staffMetaRef.current, nextCompany, prevCompany.tick, nextTick);
    nextCompany = pay.company;
    if (nextCompany.balance !== beforePay) {
      book('Gehaltslauf', nextCompany.balance - beforePay, nextTick, 'gehalt');
    }

    const beforeDepot = nextCompany.balance;
    const depotTick = processDepotTick(
      nextCompany,
      prevCompany.tick,
      nextTick,
      locomotivesRef.current,
      wagonsRef.current,
    );
    nextCompany = depotTick.company;
    if (depotTick.amount > 0) {
      book('Standort / Standgeld', nextCompany.balance - beforeDepot, nextTick, 'standort');
    }

    const beforeRent = nextCompany.balance;
    const rentalTick = processRentalTick(
      rentalsRef.current,
      nextCompany,
      nextDrivers,
      prevCompany.tick,
      nextTick,
    );
    nextCompany = rentalTick.company;
    persistRentals(rentalTick.state);
    pushNotifications(rentalTick.notifications);
    if (nextCompany.balance !== beforeRent) {
      book('Vermietung / Gestellung', nextCompany.balance - beforeRent, nextTick);
    }
    if (rentalTick.freedWagonIds.length > 0) {
      for (const wagonId of rentalTick.freedWagonIds) {
        const wagon = wagonsRef.current.find((w) => w.id === wagonId);
        if (wagon && wagon.status === 'im_einsatz') {
          patchWagonState({ ...wagon, status: 'verfuegbar' });
        }
      }
    }
    if (rentalTick.freedDriverIds.length > 0) {
      const freed = new Set(rentalTick.freedDriverIds);
      nextDrivers = nextDrivers.map((d) =>
        freed.has(d.id) && d.status === 'im_einsatz'
          ? { ...d, status: 'verfuegbar' as const, shift_start: null }
          : d,
      );
      driversRef.current = nextDrivers;
      setDrivers(nextDrivers);
    }

    const eventTick = processWorldEventsTick(eventsRef.current, {
      prevTick: prevCompany.tick,
      nextTick,
      company: nextCompany,
      drivers: nextDrivers,
      assignments: assignmentsRef.current,
      locos: locomotivesRef.current,
    });
    eventsRef.current = eventTick.state;
    setWorldEvents(eventTick.state);
    nextCompany = eventTick.company;
    if (eventTick.drivers !== nextDrivers) {
      nextDrivers = eventTick.drivers;
      driversRef.current = nextDrivers;
      setDrivers(nextDrivers);
    }
    if (eventTick.assignments !== assignmentsRef.current) {
      assignmentsRef.current = eventTick.assignments;
      setAssignments(eventTick.assignments);
    }
    if (eventTick.extraPathCost > 0) {
      book('Trassenstörung / Aufschlag', -eventTick.extraPathCost, nextTick, 'betrieb');
    }

    const beforeEinsatz = nextCompany.balance;
    const einsatzTick = processBaugleisDeploymentsTick(
      deploymentsRef.current,
      nextCompany,
      prevCompany.tick,
      nextTick,
    );
    nextCompany = einsatzTick.company;
    deploymentsRef.current = einsatzTick.list;
    setDeployments(einsatzTick.list);
    pushNotifications(einsatzTick.notifications);
    if (einsatzTick.payout !== 0) {
      book('Baugleis-Einsätze', einsatzTick.payout, nextTick, 'fracht');
    }
    if (einsatzTick.operatingCost > 0) {
      book('Baugleis Trasse/Energie/PDL', -einsatzTick.operatingCost, nextTick, 'betrieb');
    }
    const gameNowDate = tickToDate(nextTick);
    let nextOrders = ordersRef.current;
    if (einsatzTick.completedOrderIds.length > 0) {
      const done = new Set(einsatzTick.completedOrderIds);
      nextOrders = nextOrders.map((o) => (done.has(o.id) ? { ...o, status: 'abgeschlossen' as const } : o));
    }
    nextOrders = purgeExpiredOpenOrders(nextOrders, gameNowDate);
    if (nextOrders !== ordersRef.current) {
      ordersRef.current = nextOrders;
      setOrders(nextOrders);
      savePersistedOrders(nextOrders);
    }
    if (einsatzTick.completedAssignmentIds.length > 0) {
      const doneA = new Set(einsatzTick.completedAssignmentIds);
      const nextA = assignmentsRef.current.map((a) =>
        doneA.has(a.id) ? { ...a, status: 'abgeschlossen' as const } : a,
      );
      assignmentsRef.current = nextA;
      setAssignments(nextA);
      for (const id of einsatzTick.completedAssignmentIds) {
        const assignment = nextA.find((row) => row.id === id);
        if (assignment) releaseAssignmentWagons(assignment);
        const order = assignment?.order ?? nextOrders.find((o) => o.id === assignment?.order_id);
        const income = order ? Number(order.yield) : 0;
        sendMessage(
          'Disposition',
          `Auftrag erfüllt (${order?.origin ?? '—'} – ${order?.destination ?? '—'})`,
          `Einnahmen: ${formatEuro(income)}${order?.order_number ? ` · ${order.order_number}` : ''}`,
          nextTick,
        );
        if (order) {
          const xp = grantCompanyXp(nextCompany, xpForCompletedOrder(order));
          nextCompany = xp.company;
        }
        if (assignment) {
          persistAchievements(noteCompletedTrip(achievementsRef.current, { ...assignment, order }, false));
        }
      }
    }
    if (einsatzTick.freedLocoIds.length > 0) {
      const freedL = new Set(einsatzTick.freedLocoIds);
      persistLocoFleet(
        locomotivesRef.current.map((l) =>
          freedL.has(l.id) ? syncLocoStatus({ ...ensureMaintenance(l), status: isHuValid(l) ? 'frei' : 'stillgelegt' }) : l,
        ),
      );
    }
    if (einsatzTick.freedDriverIds.length > 0) {
      const freedD = new Set(einsatzTick.freedDriverIds);
      nextDrivers = nextDrivers.map((d) =>
        freedD.has(d.id) ? { ...d, status: 'verfuegbar' as const, shift_start: null } : d,
      );
      driversRef.current = nextDrivers;
      setDrivers(nextDrivers);
    }

    for (const assignment of [...assignmentsRef.current]) {
      if (isBaugleisEinsatz(assignment.order)) continue;
      if (!isAssignmentArrived(assignment, nextTick)) continue;
      nextCompany = settleSpotAssignment(assignment, nextCompany, nextTick);
    }

    persistCompany(grantAchievements(nextCompany, nextTick));

    if (!isSupabaseConfigured) return;

    persistQuietly(
      supabase.from('company').update({ tick: nextTick, updated_at: gameNowIso }).eq('id', prevCompany.id),
    );

    const prevById = new Map(prevDrivers.map((d) => [d.id, d]));
    const changedDrivers = nextDrivers.filter((d) => {
      const prev = prevById.get(d.id);
      if (!prev) return true;
      return (
        prev.status !== d.status ||
        prev.recovery_hours_left !== d.recovery_hours_left ||
        prev.hours_worked !== d.hours_worked ||
        prev.last_rest_end !== d.last_rest_end
      );
    });

    for (const driver of changedDrivers) {
      persistQuietly(
        supabase
          .from('drivers')
          .update({
            status: driver.status,
            recovery_hours_left: driver.recovery_hours_left,
            last_rest_end: driver.last_rest_end,
            shift_start: driver.shift_start,
            hours_worked: driver.hours_worked,
          })
          .eq('id', driver.id),
      );
    }

    for (const id of activatedIds) {
      persistQuietly(supabase.from('assignments').update({ status: 'aktiv' }).eq('id', id));
    }
  }, [
    completeDueWagonJobs,
    completeDueWorkshopJobs,
    persistAchievements,
    grantAchievements,
    persistLocoFleet,
    persistBank,
    persistCompany,
    persistRentals,
    book,
    debitSpotTripCosts,
    pushNotifications,
    patchWagonState,
    releaseAssignmentWagons,
  ]);

  const advanceRef = useRef(advanceOneTick);
  advanceRef.current = advanceOneTick;

  useEffect(() => {
    if (!clockRunning) return;
    const id = window.setInterval(() => {
      let leftover = clockMinutesRef.current + clockSpeed;
      while (leftover >= MINUTES_PER_HOUR) {
        leftover -= MINUTES_PER_HOUR;
        advanceRef.current();
      }
      clockMinutesRef.current = leftover;
      setClockMinutes(leftover);
      saveGameMinute(leftover);
    }, BASE_TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [clockRunning, clockSpeed]);

  function handleGesundmelden(driverId: string) {
    const current = driversRef.current.find((d) => d.id === driverId);
    if (!current || current.status !== 'krank') return;
    const gameNowIso = tickToIso(companyRef.current?.tick ?? 0);
    const updated: Driver = {
      ...current,
      status: 'verfuegbar',
      recovery_hours_left: 0,
      last_rest_end: gameNowIso,
      shift_start: null,
    };
    const nextDrivers = driversRef.current.map((d) => (d.id === driverId ? updated : d));
    driversRef.current = nextDrivers;
    setDrivers(nextDrivers);
    pushNotifications([ersatzattestNotification(updated, gameNowIso)]);
    if (!isSupabaseConfigured) return;
    persistQuietly(
      supabase
        .from('drivers')
        .update({
          status: 'verfuegbar',
          recovery_hours_left: 0,
          last_rest_end: gameNowIso,
          shift_start: null,
        })
        .eq('id', driverId),
    );
  }

  const unreadCount = unreadInboxCount(inbox);
  const fleetCount = locomotives.length + wagons.reduce((s, w) => s + w.count, 0);
  const wsDiscount = workshopDiscountPct(achievements);
  const galleryCategoryUnlocked = useMemo(() => {
    const map: Partial<Record<(typeof ACHIEVEMENT_CATEGORIES)[number]['id'], boolean>> = {};
    for (const cat of ACHIEVEMENT_CATEGORIES) {
      map[cat.id] = ACHIEVEMENTS.some((def) => def.category === cat.id && achievements.unlockedIds.includes(def.id));
    }
    return map;
  }, [achievements.unlockedIds]);
  const sectionPulse = useMemo(
    () => ({ company, locomotives, drivers, wagons, depot }),
    [company, locomotives, drivers, wagons, depot],
  );
  const dailyFixed = useMemo(
    () =>
      computeDailyFixedCosts({
        company,
        bank,
        leases: dealer?.leases,
        staffMeta,
        locomotives,
        wagons,
      }),
    [company, bank, dealer, staffMeta, locomotives, wagons],
  );
  const backToZentrale = useCallback(() => setView('zentrale'), []);

  const flushLocalSave = useCallback(() => {
    const current = companyRef.current;
    if (current) persistCompany(current);
    saveGameMinute(clockMinutesRef.current);
    saveStaffMeta(staffMetaRef.current);
    saveExtraDrivers(extraDriversRef.current);
    saveWorkshopJobs(workshopRef.current);
    saveDealerState(dealerRef.current);
    saveExtraFleet(extraFleetRef.current);
    saveSoldAssets(soldAssetsRef.current);
    saveLocoMaintPatches(locoMaintRef.current);
    persistDepot(depotRef.current);
    persistBank(bankRef.current);
    persistRentals(rentalsRef.current);
    savePersistedOrders(ordersRef.current);
    saveWorldEvents(eventsRef.current);
    saveNetworkAccess(networkRef.current);
    saveFreightContracts(industrialRef.current);
    saveAdvertisingState(adsRef.current);
    saveBaugleisDeployments(deploymentsRef.current);
    saveWagonJobs(wagonJobsRef.current);
    saveWagonPatches(wagonPatchesRef.current);
    saveChargedTripIds(chargedTripsRef.current);
    saveAchievementState(achievementsRef.current);
  }, [persistBank, persistCompany, persistDepot, persistRentals]);

  function handleHelp() {
    setLogoutOpen(false);
    setHelpOpen(true);
  }

  function handleReplayTutorial() {
    setHelpOpen(false);
    setFoundingOpen(false);
    setView('zentrale');
    setTutorialEpoch((n) => n + 1);
    setTutorialOpen(true);
  }

  function handleLogout() {
    setHelpOpen(false);
    setLogoutOpen(true);
  }

  function confirmLogoutToMenu() {
    flushLocalSave();
    setSessionActive(false);
    setLogoutOpen(false);
    setHelpOpen(false);
    setTutorialOpen(false);
    setClockRunning(false);
    setAtMainMenu(true);
  }

  function continueFromMenu() {
    setSessionActive(true);
    setAtMainMenu(false);
  }

  function handleDisponierenFromOrder(order: Order) {
    const now = tickToDate(companyRef.current?.tick ?? 0);
    if (isExpiredOpenOffer(order, now) && !order.contract_id) {
      cleanupExpiredOpenOffers();
      return;
    }
    const tickNow = companyRef.current?.tick ?? 0;
    const closed = orderBlockedByClosure(order, tickNow, eventsRef.current.closures);
    if (closed) {
      sendMessage('Warnung', 'Strecke gesperrt', closureBlockMessage(closed, tickNow), tickNow);
      return;
    }
    const netBlock = networkAcceptBlock(order, networkRef.current, locomotivesRef.current);
    if (netBlock) {
      const missing = missingNetworkCountries(networkRef.current, order);
      setDealerNetworkHighlight(missing[0] ?? null);
      setView('haendler');
      return;
    }
    if (order.status === 'offen' && !checkWagonAvailability(order, wagonsRef.current).sufficient) return;
    setDispoPreselect(order);
    setView('disposition');
  }

  function handleBuyMissingWagons(typeCode: string, qty: number) {
    setDealerPrefill({ typeCode, qty: Math.max(1, Math.round(qty)) });
    setView('haendler');
  }

  function handleQuickAcquireWagons(typeCode: string, qty: number, how: Acquisition): boolean {
    const offer = wagonOfferByTypeCode(typeCode);
    if (!offer) {
      handleBuyMissingWagons(typeCode, qty);
      return false;
    }
    return handleAcquireWagons(offer.id, how, qty);
  }

  function handleOpenBuildings() {
    setView('gebaeude');
  }

  function handleRejectOrder(order: Order) {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: 'abgelehnt' as const } : o)));
    if (!isSupabaseConfigured) return;
    persistQuietly(supabase.from('orders').update({ status: 'abgelehnt' }).eq('id', order.id));
  }

  function handleRefreshMarket() {
    const current = companyRef.current;
    const t = current?.tick ?? 0;
    if (!isMarketRefreshAvailable(marketRefreshDay, t, clockMinutes)) return;
    const day = marketRefreshDayKey(t, clockMinutes);
    saveMarketRefreshDay(day);
    setMarketRefreshDay(day);
    setOrders((prev) => refreshMarketOrders(prev, t, standingFromCompany(current)));
  }

  function handleLocalAssign(
    order: Order,
    locomotiveId: string,
    driverId: string,
    secondDriverId?: string,
    azf?: { driverId: string | null },
  ) {
    const gameNowIso = tickToIso(companyRef.current?.tick ?? 0);
    const tick = companyRef.current?.tick ?? 0;
    const loco = locomotivesRef.current.find((l) => l.id === locomotiveId);
    const driver = driversRef.current.find((d) => d.id === driverId);
    const second = secondDriverId ? driversRef.current.find((d) => d.id === secondDriverId) : undefined;
    if (!loco || !driver) return;
    if (!isLocoDeployable(ensureMaintenance(loco))) return;
    if (isBaugleisEinsatz(order) && !second) return;
    const wagonPackIds = pickWagonPacksForOrder(order, wagonsRef.current);
    if (wagonPackIds == null) return;
    const closed = orderBlockedByClosure(order, tick, eventsRef.current.closures);
    if (closed) {
      sendMessage('Warnung', 'Strecke gesperrt', closureBlockMessage(closed, tick), tick);
      return;
    }
    const dispatchBlock = networkDispatchBlock(order, loco);
    if (dispatchBlock) {
      sendMessage('Warnung', 'Netzzugang / ETCS', dispatchBlock, tick);
      return;
    }
    const seriesBlock = seriesDispatchBlock(loco, staffMetaRef.current[driverId]?.seriesIds);
    if (seriesBlock) {
      sendMessage('Warnung', 'Baureihe', seriesBlock, tick);
      return;
    }
    if (second) {
      const secondBlock = seriesDispatchBlock(loco, staffMetaRef.current[second.id]?.seriesIds);
      if (secondBlock) {
        sendMessage('Warnung', 'Baureihe', `Zweiter Tf: ${secondBlock}`, tick);
        return;
      }
    }
    const gameNowDate = tickToDate(tick);
    const restHit =
      driverRestStatus(driver, gameNowDate).violated ||
      (second ? driverRestStatus(second, gameNowDate).violated : false);
    const crewXp = Math.max(
      staffMetaRef.current[driverId]?.xp ?? 0,
      second ? staffMetaRef.current[second.id]?.xp ?? 0 : 0,
    );
    const crewRankRaw = Math.max(
      staffMetaRef.current[driverId]?.rank ?? 1,
      second ? staffMetaRef.current[second.id]?.rank ?? 1 : 1,
    );
    const crewRank = crewRankRaw >= 3 ? 3 : crewRankRaw >= 2 ? 2 : 1;
    const delayTicks = restHit ? composeTripDelay(4, locoHasEtcs(loco), crewXp, crewRank) : 0;

    const exclude = [driverId, secondDriverId].filter(Boolean) as string[];
    const azfPick = isBaugleisOrder(order)
      ? azf?.driverId
        ? (() => {
            const own = driversRef.current.find((d) => d.id === azf.driverId);
            return own
              ? { source: 'eigen' as const, driver: own, pdlDaily: 0 }
              : { source: 'pdl' as const, driver: null, pdlDaily: pdlAzfDailyRate(order) };
          })()
        : azf
          ? { source: 'pdl' as const, driver: null, pdlDaily: pdlAzfDailyRate(order) }
          : autoAzfChoice(order, driversRef.current, exclude)
      : { source: 'pdl' as const, driver: null, pdlDaily: 0 };

    const updatedDriver: Driver = { ...driver, status: 'im_einsatz', shift_start: gameNowIso };
    const updatedSecond: Driver | undefined = second
      ? { ...second, status: 'im_einsatz', shift_start: gameNowIso }
      : undefined;
    const updatedAzf: Driver | undefined =
      azfPick.driver && isBaugleisOrder(order)
        ? { ...azfPick.driver, status: 'im_einsatz', shift_start: gameNowIso }
        : undefined;
    const updatedLoco: Locomotive = { ...loco, status: 'einsatz' };
    const updatedOrder: Order = { ...order, status: 'zugewiesen' };
    const assignment: AssignmentWithDetails = {
      id: newNotificationId(),
      order_id: order.id,
      locomotive_id: locomotiveId,
      driver_id: driverId,
      second_driver_id: updatedSecond?.id ?? null,
      azf_driver_id: updatedAzf?.id ?? null,
      pdl_azf_daily: isBaugleisOrder(order) && azfPick.source === 'pdl' ? azfPick.pdlDaily : 0,
      assigned_at: gameNowIso,
      status: isBaugleisEinsatz(order) ? 'aktiv' : 'geplant',
      rest_violation: restHit,
      delay_ticks: delayTicks,
      crew_xp: crewXp,
      crew_rank: crewRank,
      contract_id: order.contract_id ?? null,
      wagon_pack_ids: wagonPackIds,
      order: updatedOrder,
      locomotive: updatedLoco,
      driver: updatedDriver,
      second_driver: updatedSecond,
      azf_driver: updatedAzf,
    };
    setAssignments((prev) => {
      const next = [assignment, ...prev];
      assignmentsRef.current = next;
      return next;
    });
    setOrders((prev) => prev.map((o) => (o.id === order.id ? updatedOrder : o)));
    setLocomotives((prev) => prev.map((l) => (l.id === locomotiveId ? updatedLoco : l)));
    if (wagonPackIds.length > 0) {
      applyWagonFleet(occupyWagonPacks(wagonsRef.current, wagonPackIds));
    }
    const nextDrivers = driversRef.current.map((d) => {
      if (d.id === driverId) return updatedDriver;
      if (updatedSecond && d.id === updatedSecond.id) return updatedSecond;
      if (updatedAzf && d.id === updatedAzf.id) return updatedAzf;
      return d;
    });
    driversRef.current = nextDrivers;
    setDrivers(nextDrivers);
    if (order.contract_id) {
      const nextC = markContractRunDispatched(industrialRef.current, order.contract_id);
      industrialRef.current = nextC;
      setIndustrial(nextC);
      saveFreightContracts(nextC);
    }
    if (restHit) {
      sendMessage(
        'Warnung',
        REST_WARNING,
        `${driver.name}${second ? ` / ${second.name}` : ''} fährt trotz Ruhezeit-/48h-Verstoß. EBA-Risiko auf der Fahrt.`,
        tick,
      );
    }
    if (isBaugleisEinsatz(order) && updatedSecond) {
      const nextDeps = startBaugleisDeployment({
        order: updatedOrder,
        locomotiveId,
        driverIds: [driverId, updatedSecond.id],
        assignmentId: assignment.id,
        tick,
        existing: deploymentsRef.current,
        fuelType: loco.fuel_type,
        pdlAzfDaily: assignment.pdl_azf_daily ?? 0,
        azfDriverId: assignment.azf_driver_id ?? null,
      });
      deploymentsRef.current = nextDeps;
      setDeployments(nextDeps);
    }
  }

  function handleLocalComplete(a: AssignmentWithDetails) {
    const current = companyRef.current;
    if (!current) return;
    persistCompany(settleSpotAssignment(a, current, current.tick));
  }

  function settleSpotAssignment(a: AssignmentWithDetails, company: Company, atTick: number): Company {
    releaseAssignmentWagons(a);
    setAssignments((prev) => {
      const next = prev.map((x) => (x.id === a.id ? { ...x, status: 'abgeschlossen' as const } : x));
      assignmentsRef.current = next;
      return next;
    });
    setOrders((prev) => {
      const next = prev.map((o) => (o.id === a.order_id ? { ...o, status: 'abgeschlossen' as const } : o));
      ordersRef.current = next;
      savePersistedOrders(next);
      return next;
    });
    persistLocoFleet(
      locomotivesRef.current.map((l) =>
        l.id === a.locomotive_id
          ? syncLocoStatus({ ...ensureMaintenance(l), status: isHuValid(l) ? 'frei' : 'stillgelegt' })
          : l,
      ),
    );
    const gameNowIso = tickToIso(atTick);
    const secondId = a.second_driver_id;
    const azfId = a.azf_driver_id;
    let nextDrivers = driversRef.current.map((d) =>
      d.id === a.driver_id || d.id === secondId || d.id === azfId
        ? { ...d, status: 'verfuegbar' as const, shift_start: null, last_rest_end: gameNowIso }
        : d,
    );
    driversRef.current = nextDrivers;
    setDrivers(nextDrivers);
    const nextMeta = grantCrewExperience(staffMetaRef.current, {
      driverId: a.driver_id,
      secondId,
      azfId,
    });
    staffMetaRef.current = nextMeta;
    setStaffMeta(nextMeta);
    saveStaffMeta(nextMeta);
    if (isBaugleisEinsatz(a.order)) {
      return company;
    }
    const yieldAmt = a.order ? Number(a.order.yield) : 0;
    let nextCo = debitSpotTripCosts(a, company, atTick);
    if (yieldAmt > 0) {
      nextCo = { ...nextCo, balance: nextCo.balance + yieldAmt };
      const tkmPart = a.order?.tkm_revenue ? ` inkl. ${a.order.tkm_revenue.toLocaleString('de-DE')} € tkm` : '';
      book(`Frachterlös ${a.order?.order_number ?? ''}${tkmPart}`, yieldAmt, atTick, 'fracht');
    }
    const deadline = a.order?.deadline;
    const penaltyAmt = Number(a.order?.penalty) || 0;
    const late = Boolean(deadline && penaltyAmt > 0 && new Date(deadline).getTime() < tickToDate(atTick).getTime());
    if (late) {
      nextCo = { ...nextCo, balance: nextCo.balance - penaltyAmt };
      book(`Pönale ${a.order?.order_number ?? ''}`, -penaltyAmt, atTick, 'strafe');
    }

    if (a.rest_violation) {
      const risk = resolveRestTripRisk();
      nextCo = { ...nextCo, balance: nextCo.balance - risk.ebaFine };
      book(`EBA-Bußgeld Ruhezeit ${a.order?.order_number ?? ''}`, -risk.ebaFine, atTick, 'strafe');
      nextCo = applyBekanntheit(nextCo, -risk.reputationLoss);
      if (risk.extraPenalty && penaltyAmt > 0 && !late) {
        nextCo = { ...nextCo, balance: nextCo.balance - penaltyAmt };
        book(`Pönale Unfall ${a.order?.order_number ?? ''}`, -penaltyAmt, atTick, 'strafe');
      }
      if (risk.accident) {
        persistAchievements(noteUnplannedFault(achievementsRef.current, atTick));
        const loco = locomotivesRef.current.find((l) => l.id === a.locomotive_id);
        if (loco) {
          persistLocoFleet(
            locomotivesRef.current.map((l) =>
              l.id === loco.id ? applyLocoFault(ensureMaintenance(l), 'laufwerk', atTick) : l,
            ),
          );
        }
      }
      if (risk.driverSick) {
        nextDrivers = nextDrivers.map((d) =>
          d.id === a.driver_id
            ? { ...d, status: 'krank' as const, recovery_hours_left: 12, shift_start: null }
            : d,
        );
        driversRef.current = nextDrivers;
        setDrivers(nextDrivers);
      }
      sendMessage(
        'Warnung',
        risk.accident ? 'Unfall nach Ruhezeitverstoß' : 'EBA-Sanktion Ruhezeit',
        `${REST_WARNING}. Bußgeld ${formatEuro(risk.ebaFine)}, Bekanntheit −${risk.reputationLoss}${
          risk.accident ? ', Schaden gemeldet — Reparatur in der Werkstatt' : ''
        }${risk.driverSick ? ', Tf krank' : ''}.`,
        atTick,
      );
    }

    sendMessage(
      'Disposition',
      `Auftrag erfüllt (${a.order?.origin ?? '—'} – ${a.order?.destination ?? '—'})`,
      `Einnahmen: ${formatEuro(yieldAmt)}${a.order?.order_number ? ` · ${a.order.order_number}` : ''}`,
      atTick,
    );
    if (a.order) {
      const xp = grantCompanyXp(nextCo, xpForCompletedOrder(a.order));
      nextCo = xp.company;
    }
    persistAchievements(noteCompletedTrip(achievementsRef.current, a, late));
    return grantAchievements(nextCo, atTick);
  }

  function handleLocalCancel(a: AssignmentWithDetails) {
    releaseAssignmentWagons(a);
    setAssignments((prev) => {
      const next = prev.map((x) => (x.id === a.id ? { ...x, status: 'abgebrochen' as const } : x));
      assignmentsRef.current = next;
      return next;
    });
    setOrders((prev) => {
      const restored = prev.map((o) => (o.id === a.order_id ? { ...o, status: 'offen' as const } : o));
      const next = purgeExpiredOpenOrders(restored, tickToDate(companyRef.current?.tick ?? 0));
      ordersRef.current = next;
      savePersistedOrders(next);
      return next;
    });
    persistLocoFleet(
      locomotivesRef.current.map((l) =>
        l.id === a.locomotive_id
          ? syncLocoStatus({ ...ensureMaintenance(l), status: isHuValid(l) ? 'frei' : 'stillgelegt' })
          : l,
      ),
    );
    const secondId = a.second_driver_id;
    const azfId = a.azf_driver_id;
    const nextDrivers = driversRef.current.map((d) =>
      d.id === a.driver_id || d.id === secondId || d.id === azfId
        ? { ...d, status: 'verfuegbar' as const, shift_start: null }
        : d,
    );
    driversRef.current = nextDrivers;
    setDrivers(nextDrivers);
    if (isBaugleisEinsatz(a.order)) {
      const nextDeps = cancelBaugleisDeployment(deploymentsRef.current, a.id);
      deploymentsRef.current = nextDeps;
      setDeployments(nextDeps);
    }
    const contractId = a.contract_id ?? a.order?.contract_id;
    if (contractId) {
      const nextC = industrialRef.current.map((c) =>
        c.id === contractId ? { ...c, fulfilledToday: Math.max(0, (c.fulfilledToday ?? 1) - 1) } : c,
      );
      industrialRef.current = nextC;
      setIndustrial(nextC);
      saveFreightContracts(nextC);
    }
  }

  function handleDisponierenFromLoco() {
    setView('disposition');
  }

  function openCompanyEditor() {
    setFoundingMode(loadCompanyProfile() ? 'edit' : 'found');
    setFoundingOpen(true);
  }

  function finishTutorial() {
    const first = !hasSeenTutorial();
    markTutorialSeen();
    setTutorialOpen(false);
    if (first) {
      sendMessage(
        'System',
        'Tutorial abgeschlossen!',
        'Willkommen in der Unternehmensführung! Dein Posteingang ist nun aktiv. Hier erhältst du Statusmeldungen zu deinen Fahrten, Finanzen und Warnungen.',
        companyRef.current?.tick ?? 0,
      );
    }
  }

  function handleSaveCompany(name: string, hqLocation: string) {
    saveCompanyProfile({ name, hq_location: hqLocation });
    const current = companyRef.current;
    if (current) {
      persistCompany({ ...current, name, hq_location: hqLocation });
    }
    setFoundingOpen(false);
  }

  function handleStartWagonJob(wagonId: string, kind: WagonJobKind): boolean {
    const rates = WAGON_JOB_RATES[kind];
    const currentCompany = companyRef.current;
    const wagon = wagonsRef.current.find((w) => w.id === wagonId);
    if (!currentCompany || !wagon) return false;
    if (isWagonRented(rentalsRef.current, wagonId)) return false;
    if (wagon.status !== 'frist_abgelaufen') return false;
    if (wagonJobsRef.current.some((j) => j.wagonId === wagonId)) return false;

    const gameNowIso = tickToIso(currentCompany.tick);
    if (!trySpend(rates.cost, rates.label)) return false;

    if (rates.ticks === 0) {
      const updated = applyCompletedJob(wagon, kind, tickToDate(currentCompany.tick));
      patchWagonState(updated);
      pushNotifications([jobCompletionNotification(updated, kind, gameNowIso)]);
      return true;
    }

    const job: WagonJob = {
      id: newWagonJobId(),
      wagonId,
      kind,
      queuedAtTick: currentCompany.tick,
      completeAtTick: currentCompany.tick + rates.ticks,
    };
    const nextJobs = [...wagonJobsRef.current, job];
    wagonJobsRef.current = nextJobs;
    setWagonJobs(nextJobs);
    saveWagonJobs(nextJobs);
    if (kind === 'rev') {
      patchWagonState({ ...wagon, status: 'wartung' });
    }
    pushNotifications([jobQueuedNotification(wagon, kind, gameNowIso)]);
    return true;
  }

  function handleTakeLoan(amount: number, termDays: number, annualPct: number, label: string): boolean {
    const current = companyRef.current;
    if (!current) return false;
    if (amount > MAX_LOAN_PRINCIPAL) return false;
    if (!isLoanAmountUnlocked(amount, current.level)) return false;
    const livePrincipal = (bankRef.current.loans ?? []).reduce((s, l) => s + (Number(l?.principalRemaining) || Number(l?.principal) || 0), 0);
    if (livePrincipal + amount > MAX_LOAN_PRINCIPAL) return false;
    const dailyPayment = loanDailyPayment(amount, termDays, annualPct);
    const totalRepayment = dailyPayment * termDays;
    const interestTotal = Math.max(0, totalRepayment - amount);
    persistCompany({ ...current, balance: current.balance + amount });
    persistAchievements(noteLoanTaken(achievementsRef.current));
    persistBank({
      ...pushBooking(bankRef.current, {
        tick: current.tick,
        createdAt: tickToIso(current.tick),
        label: `Kreditaufnahme ${label}`,
        amount,
        kind: 'kreditaufnahme',
      }),
      loans: [
        ...bankRef.current.loans,
        {
          id: newNotificationId(),
          principal: amount,
          remaining: totalRepayment,
          principalRemaining: amount,
          interestRemaining: interestTotal,
          termDays,
          dailyPayment,
          interestLabel: label,
          startedTick: current.tick,
        },
      ],
    });
    return true;
  }

  function handleSetOverdraft(limit: number): boolean {
    const current = companyRef.current;
    if (!current) return false;
    if (!canChangeOverdraftLimit(current.balance)) return false;
    const nextLimit = normalizeOverdraftLimit(limit);
    if (!isOverdraftTierUnlocked(nextLimit, current.level)) return false;
    persistBank({
      ...bankRef.current,
      overdraftLimit: nextLimit,
      overdraftDailyRate: overdraftRateForLimit(nextLimit),
    });
    return true;
  }

  function handleToggleInsurance(id: InsuranceId): boolean {
    const current = companyRef.current;
    if (!current) return false;
    const on = bankRef.current.insurances[id];
    if (on) {
      persistBank({
        ...bankRef.current,
        insurances: { ...bankRef.current.insurances, [id]: false },
      });
      return true;
    }
    const cost = INSURANCE_CATALOG[id].dailyCost;
    if (!trySpend(cost, `Versicherung ${INSURANCE_CATALOG[id].name}`, 'versicherung')) return false;
    persistBank({
      ...bankRef.current,
      insurances: { ...bankRef.current.insurances, [id]: true },
    });
    return true;
  }

  function handleRepayLoan(loanId: string): boolean {
    const current = companyRef.current;
    if (!current) return false;
    const loan = bankRef.current.loans.find((l) => l.id === loanId);
    if (!loan) return false;
    if (!canSpend(current.balance, loan.remaining, bankRef.current.overdraftLimit)) {
      pushNotifications([
        {
          type: 'warning',
          title: 'Zahlung abgelehnt',
          message: `Unzureichende Mittel für die Sondertilgung (${formatEuro(loan.remaining)}).`,
          read: false,
          created_at: tickToIso(current.tick),
        },
      ]);
      return false;
    }
    persistCompany({ ...current, balance: current.balance - loan.remaining });
    let nextBank = pushBooking(bankRef.current, {
      tick: current.tick,
      createdAt: tickToIso(current.tick),
      label: `Sondertilgung (${loan.interestLabel})`,
      amount: -loan.principalRemaining,
      kind: 'tilgung',
    });
    if (loan.interestRemaining > 0) {
      nextBank = pushBooking(nextBank, {
        tick: current.tick,
        createdAt: tickToIso(current.tick),
        label: `Kreditzinsen Sondertilgung (${loan.interestLabel})`,
        amount: -loan.interestRemaining,
        kind: 'zinsen',
      });
    }
    persistBank({
      ...nextBank,
      loans: nextBank.loans.filter((l) => l.id !== loanId),
    });
    persistAchievements(noteLoansPaidOff(achievementsRef.current, 1));
    const live = companyRef.current;
    if (live) persistCompany(grantAchievements(live));
    return true;
  }

  function handleStartCampaign(def: CampaignDef): boolean {
    const current = companyRef.current;
    if (!current) return false;
    if (!isCampaignUnlocked(def, current.level ?? 1)) return false;
    if (!trySpend(def.cost, `Kampagne ${def.name}`)) return false;
    const nextAds = startCampaign(adsRef.current, def, current.tick, current.level ?? 1);
    if (!nextAds) return false;
    adsRef.current = nextAds;
    setAds(nextAds);
    saveAdvertisingState(nextAds);
    persistCompany(applyBekanntheit(companyRef.current ?? current, def.bekanntheitGain));
    const afterAds = companyRef.current;
    if (afterAds) persistCompany(grantAchievements(afterAds));
    pushNotifications([
      {
        type: 'success',
        title: 'Kampagne gestartet',
        message: `${def.name}: +${def.bekanntheitGain} Bekanntheit. Bessere Frachtverträge werden freigeschaltet.`,
        read: false,
        created_at: tickToIso(current.tick),
      },
    ]);
    return true;
  }

  function syncExtraFleet(locos: Locomotive[], nextWagons: Wagon[]) {
    extraFleetRef.current = {
      locomotives: extraFleetRef.current.locomotives
        .map((l) => locos.find((x) => x.id === l.id) ?? l)
        .filter((l) => locos.some((x) => x.id === l.id)),
      wagons: extraFleetRef.current.wagons
        .map((w) => nextWagons.find((x) => x.id === w.id) ?? w)
        .filter((w) => nextWagons.some((x) => x.id === w.id)),
    };
    saveExtraFleet(extraFleetRef.current);
  }

  function handleAcquireLoco(
    offerId: string,
    how: Acquisition,
    options: LocoAcquireOptions = DEFAULT_LOCO_ACQUIRE,
  ): boolean {
    const offer = LOCO_OFFERS.find((o) => o.id === offerId);
    const current = companyRef.current;
    if (!offer || !current) return false;
    const berths = locoBerthCap(depotRef.current);
    if (locomotivesRef.current.length >= berths) {
      pushNotifications([
        {
          type: 'warning',
          title: 'Kein Stellplatz',
          message: `Depot voll (${locomotivesRef.current.length} / ${berths}). ${offer.displayName} wurde nicht erworben.`,
          read: false,
          created_at: tickToIso(current.tick),
        },
      ]);
      return false;
    }
    const stock = usedStockFor(dealerRef.current, offer.id);
    const buyOpts = how === 'leasing' ? { ...options, variant: 'revised' as const } : options;
    const quote = quoteLocoPurchase(offer, buyOpts.variant, stock, buyOpts.countries, buyOpts.equipment);
    const price = how === 'kauf' ? quote.total : quote.packages;
    if (price > 0 && !trySpend(price, how === 'kauf' ? `Kauf ${offer.displayName}` : `Pakete ${offer.displayName}`, 'investition')) {
      return false;
    }
    const loco = buildPurchasedLoco(
      offer,
      nextLocoName(offer.designation, locomotivesRef.current),
      buyOpts,
      buyOpts.variant === 'used' ? stock : undefined,
    );
    extraFleetRef.current = { ...extraFleetRef.current, locomotives: [...extraFleetRef.current.locomotives, loco] };
    saveExtraFleet(extraFleetRef.current);
    persistLocoFleet([...locomotivesRef.current, loco]);
    if (how === 'kauf' && buyOpts.variant === 'used') {
      const restocked = refreshUsedStockForOffer(dealerRef.current, offer.id, current.tick);
      dealerRef.current = restocked;
      setDealer(restocked);
      saveDealerState(restocked);
    }
    if (how === 'leasing') {
      const nextDealer: DealerState = {
        ...dealerRef.current,
        leases: [
          ...dealerRef.current.leases,
          {
            id: newNotificationId(),
            kind: 'loco',
            assetId: loco.id,
            label: `${offer.displayName} · ${loco.name}`,
            dailyCost: offer.leaseDaily,
            startedTick: current.tick,
          },
        ],
      };
      dealerRef.current = nextDealer;
      setDealer(nextDealer);
      saveDealerState(nextDealer);
    }
    if (isSupabaseConfigured) persistQuietly(supabase.from('locomotives').insert(loco));
    const granted = grantNetworkPackages(networkRef.current, buyOpts.countries ?? ['D']);
    if (granted.packages.join('|') !== networkRef.current.packages.join('|')) {
      networkRef.current = granted;
      setNetworkAccess(granted);
      saveNetworkAccess(granted);
    }
    const live = companyRef.current;
    if (live) persistCompany(grantAchievements(live));
    return true;
  }

  function handleAcquireWagons(offerId: string, how: Acquisition, qty = 1): boolean {
    const offer = WAGON_OFFERS.find((o) => o.id === offerId);
    const current = companyRef.current;
    if (!offer || !current) return false;
    const quote = quoteWagonDeal(offer, qty);
    const wagonCap = wagonBerthCap(depotRef.current);
    const used = wagonUnitCount(wagonsRef.current);
    if (used + quote.qty > wagonCap) {
      pushNotifications([
        {
          type: 'warning',
          title: 'Kein Wagen-Stellplatz',
          message: `Depot voll (${used} / ${wagonCap} Wagen). Frei ${Math.max(0, wagonCap - used)}, benötigt ${quote.qty}× ${offer.type_code}.`,
          read: false,
          created_at: tickToIso(current.tick),
        },
      ]);
      return false;
    }
    if (how === 'kauf' && !trySpend(quote.buyPrice, `Kauf ${quote.qty}× ${offer.type_code}`, 'investition')) return false;
    if (
      how === 'leasing' &&
      !canSpend(current.balance, quote.leaseDaily, bankRef.current.overdraftLimit)
    ) {
      pushNotifications([
        {
          type: 'warning',
          title: 'Leasing abgelehnt',
          message: `Nicht genug Kapital (Konto + Dispo) für die erste Tagesrate ${formatEuro(quote.leaseDaily)} (${quote.qty}× ${offer.type_code}).`,
          read: false,
          created_at: tickToIso(current.tick),
        },
      ]);
      return false;
    }
    const pack = buildPurchasedWagons(offer, quote.qty);
    const nextWagons = [...wagonsRef.current, pack];
    wagonsRef.current = nextWagons;
    setWagons(nextWagons);
    extraFleetRef.current = { ...extraFleetRef.current, wagons: [...extraFleetRef.current.wagons, pack] };
    saveExtraFleet(extraFleetRef.current);
    if (how === 'leasing') {
      const nextDealer: DealerState = {
        ...dealerRef.current,
        leases: [
          ...dealerRef.current.leases,
          {
            id: newNotificationId(),
            kind: 'wagon',
            assetId: pack.id,
            label: `${quote.qty}× ${offer.type_code}`,
            dailyCost: quote.leaseDaily,
            startedTick: current.tick,
          },
        ],
      };
      dealerRef.current = nextDealer;
      setDealer(nextDealer);
      saveDealerState(nextDealer);
    }
    return true;
  }

  function handleSellLoco(locoId: string): boolean {
    const loco = locomotivesRef.current.find((l) => l.id === locoId);
    if (!loco || (loco.status !== 'frei' && loco.status !== 'stillgelegt')) return false;
    const offer = offerForLoco(loco);
    const price = offer?.sellPrice ?? 200000;
    const current = companyRef.current;
    if (!current) return false;
    persistCompany({ ...current, balance: current.balance + price });
    const live = companyRef.current;
    if (live) persistCompany(grantAchievements(live));
    book(`Verkauf ${loco.name}`, price, undefined, 'investition');
    const nextLocos = locomotivesRef.current.filter((l) => l.id !== locoId);
    locomotivesRef.current = nextLocos;
    setLocomotives(nextLocos);
    extraFleetRef.current = {
      ...extraFleetRef.current,
      locomotives: extraFleetRef.current.locomotives.filter((l) => l.id !== locoId),
    };
    saveExtraFleet(extraFleetRef.current);
    soldAssetsRef.current = {
      ...soldAssetsRef.current,
      locomotives: [...soldAssetsRef.current.locomotives, locoId],
    };
    saveSoldAssets(soldAssetsRef.current);
    dealerRef.current = { ...dealerRef.current, leases: dealerRef.current.leases.filter((l) => l.assetId !== locoId) };
    setDealer(dealerRef.current);
    saveDealerState(dealerRef.current);
    return true;
  }

  function handleSellWagonPack(wagonId: string): boolean {
    const wagon = wagonsRef.current.find((w) => w.id === wagonId);
    if (!wagon || wagon.status !== 'verfuegbar') return false;
    if (isWagonRented(rentalsRef.current, wagonId)) return false;
    const offer = WAGON_OFFERS.find((o) => o.type_code === wagon.type_code);
    const price = (offer?.sellPriceEach ?? 15000) * wagon.count;
    const current = companyRef.current;
    if (!current) return false;
    persistCompany({ ...current, balance: current.balance + price });
    const liveWagon = companyRef.current;
    if (liveWagon) persistCompany(grantAchievements(liveWagon));
    book(`Verkauf ${wagon.count}× ${wagon.type_code}`, price, undefined, 'investition');
    const nextWagons = wagonsRef.current.filter((w) => w.id !== wagonId);
    wagonsRef.current = nextWagons;
    setWagons(nextWagons);
    extraFleetRef.current = {
      ...extraFleetRef.current,
      wagons: extraFleetRef.current.wagons.filter((w) => w.id !== wagonId),
    };
    saveExtraFleet(extraFleetRef.current);
    soldAssetsRef.current = { ...soldAssetsRef.current, wagons: [...soldAssetsRef.current.wagons, wagonId] };
    saveSoldAssets(soldAssetsRef.current);
    dealerRef.current = { ...dealerRef.current, leases: dealerRef.current.leases.filter((l) => l.assetId !== wagonId) };
    setDealer(dealerRef.current);
    saveDealerState(dealerRef.current);
    return true;
  }

  function handleStartWorkshopJob(locoId: string, kind: WorkshopJobKind, channel: WorkshopChannel = 'eigen'): boolean {
    const loco = locomotivesRef.current.find((l) => l.id === locoId);
    const current = companyRef.current;
    if (!loco || !current) return false;
    const ready = ensureMaintenance(loco);
    const blocked = canBookWorkshopJob(
      ready,
      workshopRef.current,
      kind,
      channel,
      current.tick,
      workshopSlotCap(depotRef.current),
    );
    if (blocked) {
      pushNotifications([
        {
          type: 'warning',
          title:
            blocked.startsWith('Erst ab')
              ? 'Frist noch ausreichend'
              : blocked === 'Kein Schaden gemeldet'
                ? 'Kein Schaden'
                : blocked === 'ETCS bereits verbaut'
                  ? 'ETCS bereits verbaut'
                  : blocked.startsWith('Kein freier Werkstatt-Slot')
                    ? 'Werkstatt voll'
                    : 'Werkstatt belegt',
          message: blocked,
          read: false,
          created_at: tickToIso(current.tick),
        },
      ]);
      return false;
    }
    const quote = quoteWorkshopJob(ready, kind, channel, workshopDiscountPct(achievementsRef.current));
    const job: WorkshopJob = {
      id: newNotificationId(),
      locoId,
      kind,
      channel,
      occupiesSlot: channel === 'fremdvergabe' ? false : quote.occupiesSlot,
      queuedAtTick: current.tick,
      completeAtTick: current.tick + quote.durationTicks,
      cost: quote.cost,
      overdueMalus: quote.overdueMalus,
    };
    if (!trySpend(quote.cost, jobLabel(job), 'betrieb')) return false;
    const nextJobs = [...workshopRef.current, job];
    workshopRef.current = nextJobs;
    setWorkshopJobs(nextJobs);
    saveWorkshopJobs(nextJobs);
    persistLocoFleet(
      locomotivesRef.current.map((l) => (l.id === locoId ? { ...ensureMaintenance(l), status: 'wartung' as const } : l)),
    );
    if (quote.durationTicks <= 0) {
      completeDueWorkshopJobs(current.tick);
      const live = companyRef.current;
      if (live) persistCompany(grantAchievements(live));
    }
    return true;
  }

  function handleRecruit(listing: JobListing, withFleetTraining = false): boolean {
    const current = companyRef.current;
    if (!current) return false;
    if (current.reputation < listing.minBekanntheit) return false;
    const missing =
      listing.role === 'tf'
        ? missingFleetSeries(listing.seriesIds, locomotivesRef.current, listing.qualifications)
        : [];
    const trainingFee =
      withFleetTraining && missing.length > 0 ? hireNachschulungFee(missing.length) : 0;
    const extraSeries = trainingFee > 0 ? missing : [];
    const total = listing.hiringCost + trainingFee;
    const spendLabel =
      trainingFee > 0
        ? `Einstellung ${listing.personName} inkl. Baureihen-Nachschulung`
        : `Einstellung ${listing.personName}`;
    if (!trySpend(total, spendLabel, 'gehalt')) return false;
    const person = buildRecruit(listingAsOffer(listing), listing.personName);
    const nextDrivers = [...driversRef.current, person];
    driversRef.current = nextDrivers;
    setDrivers(nextDrivers);
    extraDriversRef.current = [...extraDriversRef.current, person];
    saveExtraDrivers(extraDriversRef.current);
    const nextMeta = {
      ...staffMetaRef.current,
      [person.id]: listingToStaffMeta(listing, person.id, extraSeries),
    };
    staffMetaRef.current = nextMeta;
    setStaffMeta(nextMeta);
    saveStaffMeta(nextMeta);
    setJobListings(removeJobListing(listing.id));
    if (isSupabaseConfigured) persistQuietly(supabase.from('drivers').insert(person));
    const live = companyRef.current;
    if (live) persistCompany(grantAchievements(live));
    return true;
  }

  function handleBuyDepotExpansion(expansionId: string): boolean {
    const current = companyRef.current;
    const expansion = DEPOT_EXPANSIONS.find((e) => e.id === expansionId);
    if (!current || !expansion) return false;
    if (!canBuyDepotExpansion(depotRef.current, expansion, current.level)) {
      pushNotifications([
        {
          type: 'warning',
          title: 'Ausbau gesperrt',
          message: `${expansion.label} ist noch nicht freigeschaltet (Level ${expansion.unlockLevel} oder vorheriger Ausbau).`,
          read: false,
          created_at: tickToIso(current.tick),
        },
      ]);
      return false;
    }
    if (!trySpend(expansion.cost, `Depotausbau ${expansion.label}`, 'investition')) return false;
    persistDepot(purchaseDepotExpansion(depotRef.current, expansion));
    const live = companyRef.current;
    if (live) persistCompany(grantAchievements(live));
    pushNotifications([
      {
        type: 'success',
        title: 'Depot ausgebaut',
        message: `${expansion.label} freigeschaltet. Neue Kapazität: ${locoBerthCap(depotRef.current)} Loks, ${wagonBerthCap(depotRef.current)} Wagen, ${workshopSlotCap(depotRef.current)} Werkstatt-Slots.`,
        read: false,
        created_at: tickToIso(current.tick),
      },
    ]);
    return true;
  }

  function handleStartTraining(driverId: string, seriesId: string): boolean {
    const meta = staffMetaRef.current[driverId];
    const driver = driversRef.current.find((d) => d.id === driverId);
    const current = companyRef.current;
    if (!meta || !driver || !current || meta.role !== 'tf') return false;
    if (meta.trainingUntilTick != null) return false;
    if ((meta.seriesIds ?? []).includes(seriesId)) return false;
    const quote = seriesTrainingQuote(seriesId);
    if (!trySpend(quote.cost, `Schulung ${driver.name}`, 'gehalt')) return false;
    const until = current.tick + quote.durationTicks;
    const nextMeta = {
      ...staffMetaRef.current,
      [driverId]: {
        ...meta,
        trainingUntilTick: until,
        trainingKind: 'series' as const,
        trainingSeriesId: seriesId,
      },
    };
    staffMetaRef.current = nextMeta;
    setStaffMeta(nextMeta);
    saveStaffMeta(nextMeta);
    const nextDrivers = driversRef.current.map((d) =>
      d.id === driverId ? { ...d, status: 'pause' as const, recovery_hours_left: quote.durationTicks } : d,
    );
    driversRef.current = nextDrivers;
    setDrivers(nextDrivers);
    return true;
  }

  function handleRentWagons(wagonId: string, months: RentalTermMonths): boolean {
    const wagon = wagonsRef.current.find((w) => w.id === wagonId);
    const current = companyRef.current;
    if (!wagon || !current) return false;
    if (wagon.status !== 'verfuegbar') return false;
    if (isWagonRented(rentalsRef.current, wagonId)) return false;
    const started = startWagonRental(rentalsRef.current, wagon, months, current.tick);
    persistRentals(started.state);
    patchWagonState({ ...wagon, status: 'im_einsatz' });
    pushNotifications([
      {
        type: 'success',
        title: 'Wagen vermietet',
        message: `${started.rental.label} an ${started.rental.partnerName} · ${started.rental.termMonths} Mon. · ${formatEuro(started.rental.dailyIncome)}/Tag · Vollkasko.`,
        read: false,
        created_at: tickToIso(current.tick),
      },
    ]);
    return true;
  }

  function handleRespondHire(requestId: string, accept: boolean, driverId?: string): boolean {
    const current = companyRef.current;
    if (!current) return false;
    if (!accept) {
      persistRentals(declineHireRequest(rentalsRef.current, requestId));
      return true;
    }
    const driver = driversRef.current.find((d) => d.id === driverId);
    if (!driver || driver.status !== 'verfuegbar') return false;
    const accepted = acceptHireRequest(rentalsRef.current, requestId, driver, current.tick);
    if (!accepted) return false;
    persistRentals(accepted.state);
    const nextDrivers = driversRef.current.map((d) =>
      d.id === driver.id ? { ...d, status: 'im_einsatz' as const, shift_start: tickToIso(current.tick) } : d,
    );
    driversRef.current = nextDrivers;
    setDrivers(nextDrivers);
    pushNotifications([
      {
        type: 'success',
        title: 'Tf gestellt',
        message: `${driver.name} fährt ${accepted.hire.hours} h für ${accepted.hire.partnerName} · ${accepted.hire.hourlyRate} €/h.`,
        read: false,
        created_at: tickToIso(current.tick),
      },
    ]);
    return true;
  }

  function handleAcceptIndustrial(id: string) {
    const current = companyRef.current;
    if (!current) return;
    const offer = industrialRef.current.find((c) => c.id === id);
    if (!offer || !canAcceptIndustrial(offer, current)) return;
    const need = industrialWagonNeed(offer);
    if (!checkWagonAvailability(need, wagonsRef.current).sufficient) return;
    const stub = buildContractRunOrder(offer, current.tick, standingFromCompany(current));
    const netBlock = networkAcceptBlock(stub, networkRef.current, locomotivesRef.current);
    if (netBlock) {
      const missing = missingNetworkCountries(networkRef.current, stub);
      setDealerNetworkHighlight(missing[0] ?? null);
      setView('haendler');
      return;
    }
    const next = acceptContract(industrialRef.current, id, current.tick);
    industrialRef.current = next;
    setIndustrial(next);
    saveFreightContracts(next);
  }

  function handleDeclineIndustrial(id: string) {
    const next = declineContract(industrialRef.current, id);
    industrialRef.current = next;
    setIndustrial(next);
    saveFreightContracts(next);
  }

  function handleDispatchContract(id: string) {
    const current = companyRef.current;
    if (!current) return;
    const contract = industrialRef.current.find((c) => c.id === id && c.status === 'active');
    if (!contract) return;
    const need = industrialWagonNeed(contract);
    if (!checkWagonAvailability(need, wagonsRef.current).sufficient) return;
    const required = requiredDeparturesFor(contract, current.level);
    const pending = pendingContractOrders(ordersRef.current, id);
    const openPending = pending.find((o) => o.status === 'offen');
    if (openPending) {
      handleDisponierenFromOrder(openPending);
      return;
    }
    if (pending.length >= required) {
      const assigned = pending.find((o) => o.status === 'zugewiesen');
      if (assigned) {
        setView('disposition');
      }
      return;
    }
    const run = buildContractRunOrder(
      contract,
      current.tick,
      standingFromCompany(current),
      new Set(ordersRef.current.map((o) => o.order_number)),
    );
    const nextOrders = [run, ...ordersRef.current];
    ordersRef.current = nextOrders;
    setOrders(nextOrders);
    savePersistedOrders(nextOrders);
    handleDisponierenFromOrder(run);
  }

  function handleBuyNetworkPackage(id: CountryPackage): boolean {
    const current = companyRef.current;
    if (!current) return false;
    if (networkRef.current.packages.includes(id)) return true;
    const price = countryPackagePrice(id);
    if (price > 0 && !trySpend(price, `Netzzugang ${countryPackageLabel(id)}`, 'investition')) return false;
    const next = grantNetworkPackages(networkRef.current, [id]);
    networkRef.current = next;
    setNetworkAccess(next);
    saveNetworkAccess(next);
    setDealerNetworkHighlight(null);
    return true;
  }

  const clockValue = useMemo(
    () => ({
      tick,
      gameNow,
      running: clockRunning,
      speed: clockSpeed,
      setRunning: setClockRunning,
      setSpeed: setClockSpeed,
    }),
    [tick, gameNow, clockRunning, clockSpeed],
  );

  const sanierung = useMemo(() => sanierungSnapshot(bank, tick), [bank, tick]);
  useEffect(() => {
    if (!sanierung.insolvent) setInsolvencyDismissed(false);
  }, [sanierung.insolvent]);

  const glass = view !== 'zentrale';
  const atmosphere = atmosphereForView(view);

  return (
    <GameClockProvider value={clockValue}>
      {atMainMenu ? (
        <MainMenuScreen
          companyName={company?.name ?? 'AixRail GmbH'}
          hqLocation={company?.hq_location?.trim() || 'Aachen'}
          balance={company?.balance ?? 0}
          level={company?.level ?? 1}
          onContinue={continueFromMenu}
        />
      ) : (
      <Layout
        view={view}
        atmosphere={atmosphere}
        topbar={{
          headerRef,
          view,
          company,
          fleetCount,
          personnelCount: drivers.length,
          clockRunning,
          clockSpeed,
          gameNow,
          unreadCount,
          onSetView: setView,
          onSetClockRunning: setClockRunning,
          onSetClockSpeed: setClockSpeed,
          onOpenInbox: () => setView('posteingang'),
          onEditCompany: openCompanyEditor,
          onHelp: handleHelp,
          onLogout: handleLogout,
        }}
      >

        {(sanierung.active || sanierung.insolvent) && (
          <div
            className={`fixed left-0 right-0 z-40 border-b px-4 py-1.5 text-center text-[11px] font-bold ${
              sanierung.insolvent
                ? 'border-rose-500/40 bg-rose-950/90 text-rose-100'
                : 'border-amber-500/40 bg-amber-950/90 text-amber-100'
            }`}
            style={{ top: 'var(--app-header-h, 4.5rem)' }}
          >
            {sanierung.insolvent
              ? 'Insolvenz — die 14-tägige Sanierung ist abgelaufen. Konto unter dem Dispo-Limit.'
              : `Sanierung: noch ${sanierung.daysRemaining} ${sanierung.daysRemaining === 1 ? 'Tag' : 'Tage'} — Konto unter dem gewählten Dispo-Limit.`}
          </div>
        )}

        {sanierung.insolvent && !insolvencyDismissed && (
          <div className="modal-scrim fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="app-glass w-full max-w-md rounded-xl border-rose-500/40 p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-rose-200">Insolvenz</h2>
              <p className="mt-2 text-sm text-slate-300">
                Die 14-tägige Sanierung ist abgelaufen. Der Kontostand liegt weiter unter dem gewählten
                Kreditrahmen von {formatEuro(bank.overdraftLimit)}.
              </p>
              <button
                type="button"
                className="mt-4 rounded-lg border border-rose-500/40 bg-rose-950/50 px-4 py-2 text-xs font-bold text-rose-100 hover:bg-rose-900/50"
                onClick={() => setInsolvencyDismissed(true)}
              >
                Schließen
              </button>
            </div>
          </div>
        )}

        <main className={glass ? 'relative z-10' : 'relative z-10 min-h-[100dvh] bg-transparent'}>
          {view === 'zentrale' && (
            <OfficeHQView
              onNavigate={(dest) => setView(dest)}
              onEditCompany={openCompanyEditor}
              onOpenGallery={() => setGalleryOpen(true)}
              galleryUnlocked={achievements.unlockedIds.length}
              galleryTotal={achievementCount()}
              galleryCategoryUnlocked={galleryCategoryUnlocked}
            />
          )}
          {glass && (
            <div
              className="app-main-content"
              style={{ paddingTop: 'calc(var(--app-header-h) + 1.75rem)' }}
            >
              <SectionPulseProvider pulse={sectionPulse} onBack={backToZentrale}>
              {view === 'dashboard' && (
                <PcDashboardView
                  active={view}
                  locomotives={locomotives}
                  drivers={drivers}
                  unreadCount={unreadCount}
                  onNavigate={setView}
                />
              )}
              {view === 'auswertungen' && (
                <CentralView
                  company={company}
                  locomotives={locomotives}
                  drivers={drivers}
                  orders={orders}
                  assignments={assignments}
                  wagons={wagons}
                  dailyFixed={dailyFixed}
                  onEditCompany={openCompanyEditor}
                />
              )}
              {view === 'posteingang' && (
                <InboxView
                  messages={inbox}
                  drivers={drivers}
                  rentals={rentals}
                  onMarkRead={(id) => setInbox(markMessageRead(id))}
                  onDelete={(id) => setInbox(deleteMessage(id))}
                  onMarkAllRead={() => setInbox(markAllMessagesRead())}
                  onDeleteRead={() => setInbox(deleteReadMessages())}
                  onRespondHire={handleRespondHire}
                />
              )}
              {view === 'auftragsmarkt' && (
                <OrderMarketView
                  orders={orders}
                  wagons={wagons}
                  loading={loading}
                  onDisponieren={handleDisponierenFromOrder}
                  onReject={handleRejectOrder}
                  onRefreshMarket={handleRefreshMarket}
                  marketRefreshLocked={!isMarketRefreshAvailable(marketRefreshDay, tick, clockMinutes)}
                  onCleanupExpired={cleanupExpiredOpenOffers}
                  onBuyMissingWagons={handleBuyMissingWagons}
                  onQuickAcquireWagons={handleQuickAcquireWagons}
                  onOpenBuildings={handleOpenBuildings}
                  freeBerths={freeWagonBerths(depot, wagonUnitCount(wagons))}
                  networkAccess={networkAccess}
                  locomotives={locomotives}
                  worldEvents={worldEvents}
                  onOpenNetworkDealer={() => {
                    setDealerNetworkHighlight(null);
                    setView('haendler');
                  }}
                />
              )}
              {view === 'spielerboerse' && <PlayerMarketView />}
              {view === 'disposition' && (
                <DispatchView
                  orders={orders}
                  locomotives={locomotives}
                  drivers={drivers}
                  assignments={assignments}
                  wagons={wagons}
                  loading={loading}
                  onDataChange={fetchData}
                  preselectOrder={dispoPreselect}
                  onLocalAssign={handleLocalAssign}
                  onLocalComplete={handleLocalComplete}
                  onLocalCancel={handleLocalCancel}
                  deployments={deployments}
                  hqLocation={company?.hq_location}
                  onBackOffice={() => setView('zentrale')}
                  onBackPc={() => setView('dashboard')}
                  onBuyMissingWagons={handleBuyMissingWagons}
                  onQuickAcquireWagons={handleQuickAcquireWagons}
                  onOpenBuildings={handleOpenBuildings}
                  freeBerths={freeWagonBerths(depot, wagonUnitCount(wagons))}
                  networkAccess={networkAccess}
                  worldEvents={worldEvents}
                  staffMeta={staffMeta}
                  onOpenNetworkDealer={() => {
                    setDealerNetworkHighlight(null);
                    setView('haendler');
                  }}
                />
              )}
              {view === 'tourenplaner' && (
                <TourPlannerView
                  orders={orders}
                  locomotives={locomotives}
                  drivers={drivers}
                  wagons={wagons}
                  staffMeta={staffMeta}
                  onAssign={handleLocalAssign}
                  onOpenDisposition={() => setView('disposition')}
                  onBuyMissingWagons={handleBuyMissingWagons}
                  onQuickAcquireWagons={handleQuickAcquireWagons}
                  onOpenBuildings={handleOpenBuildings}
                  freeBerths={freeWagonBerths(depot, wagonUnitCount(wagons))}
                />
              )}
              {view === 'tourenuebersicht' && (
                <TourOverviewView assignments={assignments} onOpenDisposition={() => setView('disposition')} />
              )}
              {view === 'fuhrpark' && (
                <FleetView
                  locomotives={locomotives}
                  wagons={wagons}
                  rentals={rentals}
                  workshopJobs={workshopJobs}
                  depot={depot}
                  companyLevel={company?.level ?? 1}
                  balance={company?.balance ?? 0}
                  overdraftLimit={bank.overdraftLimit}
                  loading={loading}
                  onDisponieren={handleDisponierenFromLoco}
                  onOpenWagenpark={() => setView('wagenpark')}
                  onRentWagons={handleRentWagons}
                  onBuyDepotExpansion={handleBuyDepotExpansion}
                  onStartWorkshopJob={handleStartWorkshopJob}
                  workshopDiscountPct={wsDiscount}
                  achievements={achievements}
                />
              )}
              {view === 'wagenpark' && (
                <WagonParkView
                  wagons={wagons}
                  loading={loading}
                  company={company}
                  jobs={wagonJobs}
                  rentals={rentals}
                  onStartWagonJob={handleStartWagonJob}
                  onRentWagons={handleRentWagons}
                />
              )}
              {(view === 'haendler' || view === 'werkstatt') && (
                <DealerView
                  mode={view === 'werkstatt' ? 'workshop' : 'shop'}
                  company={company}
                  locomotives={locomotives}
                  wagons={wagons}
                  dealer={dealer}
                  workshopJobs={workshopJobs}
                  rentals={rentals}
                  depot={depot}
                  overdraftLimit={bank.overdraftLimit}
                  prefillWagon={dealerPrefill}
                  onAcquireLoco={handleAcquireLoco}
                  onAcquireWagons={handleAcquireWagons}
                  onSellLoco={handleSellLoco}
                  onSellWagonPack={handleSellWagonPack}
                  onStartWorkshopJob={handleStartWorkshopJob}
                  onRentWagons={handleRentWagons}
                  onBuyDepotExpansion={handleBuyDepotExpansion}
                  networkAccess={networkAccess}
                  onBuyNetworkPackage={handleBuyNetworkPackage}
                  highlightNetwork={dealerNetworkHighlight}
                  workshopDiscountPct={wsDiscount}
                  achievements={achievements}
                />
              )}
              {view === 'bank' && (
                <BankView
                  company={company}
                  bank={bank}
                  onTakeLoan={handleTakeLoan}
                  onSetOverdraft={handleSetOverdraft}
                  onToggleInsurance={handleToggleInsurance}
                  onRepayLoan={handleRepayLoan}
                  dailyFixed={dailyFixed}
                />
              )}
              {view === 'finanzen' && (
                <FinanceView
                  company={company}
                  orders={orders}
                  dailyFixed={dailyFixed}
                  bank={bank}
                  locomotives={locomotives}
                  wagons={wagons}
                  dealer={dealer}
                  onEditCompany={openCompanyEditor}
                  onOpenBank={() => setView('bank')}
                />
              )}
              {view === 'personal' && (
                <PersonnelView
                  drivers={drivers}
                  locomotives={locomotives}
                  listings={jobListings}
                  loading={loading}
                  onGesundmelden={handleGesundmelden}
                  staffMeta={staffMeta}
                  bekanntheit={company?.reputation ?? 0}
                  onRecruit={handleRecruit}
                  onStartTraining={handleStartTraining}
                  balance={company?.balance ?? 0}
                  overdraftLimit={bank.overdraftLimit}
                />
              )}
              {view === 'werbung' && (
                <AdvertisingView company={company} ads={ads} onStartCampaign={handleStartCampaign} />
              )}
              {view === 'vertraege' && (
                <ContractsView
                  orders={orders}
                  wagons={wagons}
                  onOpenDisposition={handleDisponierenFromOrder}
                  industrial={industrial}
                  bekanntheit={company?.reputation ?? 0}
                  companyLevel={company?.level ?? 1}
                  onAcceptIndustrial={handleAcceptIndustrial}
                  onDeclineIndustrial={handleDeclineIndustrial}
                  onBuyMissingWagons={handleBuyMissingWagons}
                  onQuickAcquireWagons={handleQuickAcquireWagons}
                  onOpenBuildings={handleOpenBuildings}
                  freeBerths={freeWagonBerths(depot, wagonUnitCount(wagons))}
                  assignments={assignments}
                  companyTick={company?.tick ?? 0}
                  onDispatchContract={handleDispatchContract}
                  networkAccess={networkAccess}
                  locomotives={locomotives}
                  onOpenNetworkDealer={() => {
                    setDealerNetworkHighlight(null);
                    setView('haendler');
                  }}
                />
              )}
              {view === 'gebaeude' && (
                <BuildingsView
                  hqLocation={company?.hq_location}
                  companyName={company?.name}
                  depot={depot}
                  companyLevel={company?.level ?? 1}
                  balance={company?.balance ?? 0}
                  locoCount={locomotives.length}
                  wagons={wagons}
                  workshopUsed={usedWorkshopSlots(workshopJobs, tick)}
                  onBuyExpansion={handleBuyDepotExpansion}
                />
              )}
              </SectionPulseProvider>
            </div>
          )}
        </main>
        {foundingOpen && (
          <CompanyFoundingModal
            mode={foundingMode}
            initialName={company?.name}
            initialLocation={company?.hq_location}
            onSave={handleSaveCompany}
            onCancel={foundingMode === 'edit' ? () => setFoundingOpen(false) : undefined}
            onReplayTutorial={
              foundingMode === 'edit'
                ? () => {
                    setFoundingOpen(false);
                    setTutorialEpoch((n) => n + 1);
                    setTutorialOpen(true);
                  }
                : undefined
            }
          />
        )}
        {tutorialOpen && !foundingOpen && (
          <TutorialOverlay
            key={tutorialEpoch}
            onComplete={finishTutorial}
            onSkip={finishTutorial}
            onNavigate={setView}
          />
        )}
        {helpOpen && !tutorialOpen && (
          <HelpHandbookModal onClose={() => setHelpOpen(false)} onReplayTutorial={handleReplayTutorial} />
        )}
        {galleryOpen && company && (
          <AchievementsGalleryModal
            state={achievements}
            world={achievementWorldFor(company)}
            onClose={() => setGalleryOpen(false)}
          />
        )}
        {logoutOpen && (
          <LogoutConfirmModal onCancel={() => setLogoutOpen(false)} onConfirm={confirmLogoutToMenu} />
        )}
      </Layout>
      )}
    </GameClockProvider>
  );
}

export default App;
