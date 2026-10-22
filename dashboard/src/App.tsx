import { Layout } from "./components/Layout";
import { useStore } from "./state/store";
import { OverviewPage } from "./pages/Overview";
import { ParticlesPage } from "./pages/Particles";
import { EdsPage } from "./pages/Eds";
import { IntegrationPage } from "./pages/Integration";
import { HazardPage } from "./pages/Hazard";
import { SamplesPage } from "./pages/Samples";
import { DataPage } from "./pages/Data";
import { SettingsPage } from "./pages/Settings";
import { SimulatorPage } from "./pages/Simulator";

export function App() {
  const { route } = useStore();
  const page = {
    simulator: <SimulatorPage />,
    overview: <OverviewPage />,
    particles: <ParticlesPage />,
    eds: <EdsPage />,
    integration: <IntegrationPage />,
    hazard: <HazardPage />,
    samples: <SamplesPage />,
    data: <DataPage />,
    settings: <SettingsPage />,
  }[route.page];
  return <Layout>{page}</Layout>;
}
