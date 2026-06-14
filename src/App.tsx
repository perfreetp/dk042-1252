import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { TemplateList } from '@/pages/Templates/TemplateList';
import { TemplateDesigner } from '@/pages/Designer/TemplateDesigner';
import { ProjectList } from '@/pages/Projects/ProjectList';
import { ProjectDetail } from '@/pages/Projects/ProjectDetail';
import { TaskList } from '@/pages/Tasks/TaskList';
import { TaskDetail } from '@/pages/Tasks/TaskDetail';
import { ApprovalsPage } from '@/pages/Approvals/ApprovalsPage';
import { ExceptionList } from '@/pages/Exceptions/ExceptionList';
import { NewException } from '@/pages/Exceptions/NewException';
import { ReportsPage } from '@/pages/Reports/ReportsPage';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/templates" replace />} />
          <Route path="/templates" element={<TemplateList />} />
          <Route path="/templates/new" element={<TemplateDesigner />} />
          <Route path="/templates/:id/edit" element={<TemplateDesigner />} />
          <Route path="/projects" element={<ProjectList />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/exceptions" element={<ExceptionList />} />
          <Route path="/exceptions/new" element={<NewException />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
      </Routes>
    </Router>
  );
}
