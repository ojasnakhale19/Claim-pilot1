import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ClaimFlowPage } from './pages/ClaimFlowPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ClaimFlowPage />} />
      </Routes>
    </BrowserRouter>
  );
}