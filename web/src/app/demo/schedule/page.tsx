import { redirect } from 'next/navigation';

/** The sample round has no scheduling; the captured schedule screen lives with the stage gallery. */
export default function Page() {
  redirect('/demo/stages/schedule');
}
