import { Routes, Route } from 'react-router-dom'
import { ReviewPage } from '@/pages/ReviewPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<div>SuperDocs</div>} />
      <Route path="/review" element={<ReviewPage />} />
    </Routes>
  )
}

export default App
