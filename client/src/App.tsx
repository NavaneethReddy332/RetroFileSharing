import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./contexts/AuthContext";
import Home from "./pages/Home";
import Receive from "./pages/Receive";
import YourFiles from "./pages/YourFiles";
import NotFound from "./pages/not-found";

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/send" component={Home} />
            <Route path="/receive" component={Receive} />
            <Route path="/your-files" component={YourFiles} />
            <Route component={NotFound} />
          </Switch>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
