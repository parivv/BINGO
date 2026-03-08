export default function CreatePageRoute({ user, setUser, DashboardGate }) {
  return <DashboardGate user={user} setUser={setUser} initialTab="create" />;
}
