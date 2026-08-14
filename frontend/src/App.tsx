import { Routes, Route, Navigate } from 'react-router-dom'
import { ReviewPage } from '@/pages/ReviewPage'
import { PipelineCanvas } from '@/pages/PipelineCanvas'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/pipeline" replace />} />
      <Route path="/pipeline" element={<PipelineCanvas />} />
      <Route path="/review" element={<ReviewPage />} />
    </Routes>
  )
}

export default App
