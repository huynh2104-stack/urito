import { useEffect } from 'react';
import { Shell } from './components/Shell';
import { ConfirmHost, Spinner, ToastHost } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrintHost } from './print/PrintHost';
import { useRoute } from './router';
import { can, ROUTE_PERMISSION, useApp, useT } from './store/app';
import { navigate } from './router';
import { Button, EmptyState } from './components/ui';
import { useAutoBackup } from './features/backup/useAutoBackup';
import { OnboardingPage } from './features/onboarding/OnboardingPage';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { PosPage } from './features/pos/PosPage';
import { TablesPage } from './features/tables/TablesPage';
import { OrdersPage } from './features/orders/OrdersPage';
import { ProductsPage } from './features/products/ProductsPage';
import { InventoryPage } from './features/inventory/InventoryPage';
import { CustomersPage } from './features/customers/CustomersPage';
import { SuppliersPage } from './features/suppliers/SuppliersPage';
import { PurchasesPage } from './features/purchases/PurchasesPage';
import { ShiftsPage } from './features/shifts/ShiftsPage';
import { ExpensesPage } from './features/expenses/ExpensesPage';
import { PromotionsPage } from './features/promotions/PromotionsPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { UsersPage } from './features/users/UsersPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { BackupPage } from './features/backup/BackupPage';
import { LabelsPage } from './features/products/LabelsPage';
import { RoadmapPage } from './features/roadmap/RoadmapPage';

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
        <OnboardingPage />
        <ToastHost />
        <ConfirmHost />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <LoginPage />
        <ToastHost />
        <ConfirmHost />
      </>
    );
  }

  return (
    <>
      <Shell>
        <ErrorBoundary scope="route">
          <RouteView />
        </ErrorBoundary>
      </Shell>
      <ToastHost />
      <ConfirmHost />
      <PrintHost />
    </>
  );
}
