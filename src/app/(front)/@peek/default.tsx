// No peek: the landing, or a feature page visited directly. (A soft
// navigation never needs this to close the peek: the peek is always one
// history entry deep — switching features inside it replaces that entry —
// so closing is one step back, which unmounts the slot's route.)
export default function PeekClosed() {
  return null;
}
