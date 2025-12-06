import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./contexts/AuthContext";
import { RefreshProvider } from "./contexts/RefreshContext";
import { motion, AnimatePresence } from "framer-motion";
import Home from "./pages/Home";
import Receive from "./pages/Receive";
import YourFiles from "./pages/YourFiles";
import About from "./pages/About";
import Feedback from "./pages/Feedback";
import Account from "./pages/Account";
import NotFound from "./pages/not-found";

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -10 },
};

const pageTransition = {
  type: 'tween' as const,
  ease: 'easeOut' as const,
  duration: 0.25,
};

function AnimatedRoutes() {
  const [location] = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        initial="initial"
        animate="in"
        exit="out"
        variants={pageVariants}
        transition={pageTransition}
        className="h-full"
      >
        <Switch location={location}>
          <Route path="/" component={Home} />
          <Route path="/send" component={Home} />
          <Route path="/receive" component={Receive} />
          <Route path="/your-files" component={YourFiles} />
          <Route path="/account" component={Account} />
          <Route path="/about" component={About} />
          <Route path="/feedback" component={Feedback} />
          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RefreshProvider>
            <AnimatedRoutes />
          </RefreshProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
