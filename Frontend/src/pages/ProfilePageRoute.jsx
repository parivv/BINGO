export default function ProfilePageRoute({ user, setUser, DashboardGate }) {
  return <DashboardGate user={user} setUser={setUser} initialTab="profile" />;
}
