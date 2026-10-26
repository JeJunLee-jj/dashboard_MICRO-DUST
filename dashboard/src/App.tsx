import { Layout } from "./components/Layout";
import { useStore } from "./state/store";
import { SimulatorPage } from "./pages/Simulator";
import { ParticlesPage } from "./pages/Particles";
import { DataPage } from "./pages/Data";

export function App() {
  const { route } = useStore();
  const page = {
    simulator: <SimulatorPage />,
    particles: <ParticlesPage />,
    data: <DataPage />,
  }[route.page];
  return <Layout>{page}</Layout>;
}
