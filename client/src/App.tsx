import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./contexts/AuthContext";
import { RefreshProvider } from "./contexts/RefreshContext";
import Home from "./pages/Home";
import Receive from "./pages/Receive";
import YourFiles from "./pages/YourFiles";
import About from "./pages/About";
import Feedback from "./pages/Feedback";
import NotFound from "./pages/not-found";

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RefreshProvider>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/send" component={Home} />
              <Route path="/receive" component={Receive} />
              <Route path="/your-files" component={YourFiles} />
              <Route path="/about" component={About} />
              <Route path="/feedback" component={Feedback} />
              <Route component={NotFound} />
            </Switch>
          </RefreshProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
