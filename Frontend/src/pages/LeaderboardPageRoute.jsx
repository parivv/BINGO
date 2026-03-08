export default function LeaderboardPageRoute({ user, setUser, DashboardGate }) {
  return <DashboardGate user={user} setUser={setUser} initialTab="leaderboard" />;
}
