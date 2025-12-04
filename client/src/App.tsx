import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Home from "./pages/Home";
import Receive from "./pages/Receive";
import NotFound from "./pages/not-found";

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/send" component={Home} />
          <Route path="/receive" component={Receive} />
          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
