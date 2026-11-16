import { lazy, Suspense, useEffect } from 'react';
import { Shell } from './components/Shell';
import { Button, ConfirmHost, EmptyState, Spinner, ToastHost } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrintHost } from './print/PrintHost';
import { navigate, useRoute } from './router';
import { can, ROUTE_PERMISSION, useApp, useT } from './store/app';
import { useAutoBackup } from './features/backup/useAutoBackup';
import { PosPage } from './features/pos/PosPage';

// C-05: 起動直後に必須の POS / Shell 以外は画面単位で遅延読込する
const OnboardingPage = lazy(() => import('./features/onboarding/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));
const LoginPage = lazy(() => import('./features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const TablesPage = lazy(() => import('./features/tables/TablesPage').then((m) => ({ default: m.TablesPage })));
const OrdersPage = lazy(() => import('./features/orders/OrdersPage').then((m) => ({ default: m.OrdersPage })));
const ProductsPage = lazy(() => import('./features/products/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const InventoryPage = lazy(() => import('./features/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const CustomersPage = lazy(() => import('./features/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const SuppliersPage = lazy(() => import('./features/suppliers/SuppliersPage').then((m) => ({ default: m.SuppliersPage })));
const PurchasesPage = lazy(() => import('./features/purchases/PurchasesPage').then((m) => ({ default: m.PurchasesPage })));
const ShiftsPage = lazy(() => import('./features/shifts/ShiftsPage').then((m) => ({ default: m.ShiftsPage })));
const ExpensesPage = lazy(() => import('./features/expenses/ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const PromotionsPage = lazy(() => import('./features/promotions/PromotionsPage').then((m) => ({ default: m.PromotionsPage })));
const ReportsPage = lazy(() => import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => import('./features/users/UsersPage').then((m) => ({ default: m.UsersPage })));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const BackupPage = lazy(() => import('./features/backup/BackupPage').then((m) => ({ default: m.BackupPage })));
const LabelsPage = lazy(() => import('./features/products/LabelsPage').then((m) => ({ default: m.LabelsPage })));
const RoadmapPage = lazy(() => import('./features/roadmap/RoadmapPage').then((m) => ({ default: m.RoadmapPage })));

function NoPermission() {
  const t = useT();
  return (
    <div className="page">
      <div className="card">
        <EmptyState
          icon="lock"
          title={t('auth.noPermission')}
          description={t('auth.noPermissionHint')}
          action={
            <Button variant="primary" onClick={() => navigate('/')}>
              {t('nav.dashboard')}
            </Button>
          }
        />
      </div>
    </div>
  );
}

function RouteView() {
  const route = useRoute();
  const user = useApp((s) => s.user);
  const needed = ROUTE_PERMISSION[route.segments[0] ?? ''] ?? 'sell';
  if (!can(user, needed)) return <NoPermission />;
  switch (route.segments[0]) {
    case undefined:
      return <DashboardPage />;
    case 'pos':
      return <PosPage />;
    case 'tables':
      return <TablesPage />;
    case 'orders':
      return <OrdersPage />;
    case 'products':
      return <ProductsPage />;
    case 'inventory':
      return <InventoryPage />;
    case 'customers':
      return <CustomersPage />;
    case 'suppliers':
      return <SuppliersPage />;
    case 'purchases':
      return <PurchasesPage />;
    case 'shifts':
      return <ShiftsPage />;
    case 'expenses':
      return <ExpensesPage />;
    case 'promotions':
      return <PromotionsPage />;
    case 'reports':
      return <ReportsPage />;
    case 'users':
      return <UsersPage />;
    case 'settings':
      return <SettingsPage />;
    case 'backup':
      return <BackupPage />;
    case 'labels':
      return <LabelsPage />;
    case 'roadmap':
      return <RoadmapPage />;
    default:
      return <DashboardPage />;
  }
}

export default function App() {
  return (
    <ErrorBoundary scope="app">
      <AppInner />
    </ErrorBoundary>
  );
}

function AppInner() {
  const { ready, settings, user, init } = useApp();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!ready || !settings.onboarded || !user) return;
    const prefetch = () => {
      void import('./features/dashboard/DashboardPage');
      void import('./features/orders/OrdersPage');
      void import('./features/products/ProductsPage');
      void import('./features/shifts/ShiftsPage');
      void import('./features/reports/ReportsPage');
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(prefetch, { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const tid = window.setTimeout(prefetch, 1200);
    return () => window.clearTimeout(tid);
  }, [ready, settings.onboarded, user]);

  useAutoBackup();

  if (!ready) {
    return (
      <div className="full-center">
        <Spinner />
      </div>
    );
  }

  if (!settings.onboarded) {
    return (
      <>
        <Suspense fallback={<div className="full-center"><Spinner /></div>}>
          <OnboardingPage />
        </Suspense>
        <ToastHost />
        <ConfirmHost />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Suspense fallback={<div className="full-center"><Spinner /></div>}>
          <LoginPage />
        </Suspense>
        <ToastHost />
        <ConfirmHost />
      </>
    );
  }

  return (
    <>
      <Shell>
        <ErrorBoundary scope="route">
          <Suspense fallback={<div className="page center"><Spinner /></div>}>
            <RouteView />
          </Suspense>
        </ErrorBoundary>
      </Shell>
      <ToastHost />
      <ConfirmHost />
      <PrintHost />
    </>
  );
}
