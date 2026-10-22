'use client';

import React, { use, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, GraduationCap, Loader2, Radio } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { AuthUser, JoinInfo } from '@/lib/types';
import { AccountForms } from '@/components/auth/AccountForms';

/**
 * Class or section invite link shared by the instructor (/join/<code>).
 * Signed-in students are enrolled straight away (a section link also places them in that
 * section); everyone else signs in or creates a student account here. A class that is live
 * opens its meeting; otherwise the student portal waits for the next one.
 */
export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  // The link code is only known per request: render the page inside a Suspense boundary
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-[#0B1528]">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </main>
      }
    >
      <Join params={params} />
    </Suspense>
  );
}

function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<AuthUser | null>(null);
  const [checkingUser, setCheckingUser] = useState(true);

  const goOn = (live: JoinInfo['live_session']) =>
    router.replace(live?.join_code ? `/meet/${live.join_code}` : '/student');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const joinInfo = await api.joinInfo(code);
        if (cancelled) return;
        setInfo(joinInfo);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError && e.status === 404 ? 'This join link is not valid. Ask your instructor for a new one.' : 'Cannot reach the class server.');
        setCheckingUser(false);
        return;
      }
      try {
        const me = await api.me();
        if (cancelled) return;
        if (me.role !== 'student') {
          setStaff(me);
        } else {
          const joined = await api.joinEnroll(code);
          if (!cancelled) goOn(joined.live_session);
          return;
        }
      } catch {
        // Not signed in: show the forms
      }
      if (!cancelled) setCheckingUser(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0B1528] p-4 sm:p-6">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shrink-0">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-slate-900 text-lg leading-tight truncate">
              {info ? `Join ${info.course.title}` : 'Join a class'}
            </h1>
            {info && (
              <p className="text-[11px] text-slate-500 truncate">
                {info.course.code}
                {info.section ? ` · Section ${info.section}` : ''} · {info.instructor}
              </p>
            )}
          </div>
        </div>

        {info && (
          <p
            className={`mb-5 flex items-center gap-2 text-xs font-medium rounded-xl px-3 py-2 border ${
              info.live_session
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 shrink-0 ${info.live_session ? 'animate-pulse' : ''}`} />
            {info.live_session ? `Live now: ${info.live_session.title}` : 'The class has not started yet - you can join and wait.'}
          </p>
        )}

        {error ? (
          <p className="flex items-start gap-2 text-sm text-slate-700">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            {error}
          </p>
        ) : checkingUser ? (
          <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
        ) : staff ? (
          <div className="space-y-4 text-sm text-slate-700">
            <p>
              You are signed in as <b>{staff.name}</b> ({staff.role}). This is the link students use to join the class;
              share it with them.
            </p>
            <Link
              href="/"
              className="block text-center w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl"
            >
              Go to the dashboard
            </Link>
          </div>
        ) : (
          <AccountForms
            onRegister={async (data) => {
              const result = await api.joinRegister(code, data);
              goOn(result.live_session);
            }}
            onSignIn={async (username, password) => {
              const { user } = await api.login(username, password);
              if (user.role !== 'student') {
                setStaff(user);
                return;
              }
              const joined = await api.joinEnroll(code);
              goOn(joined.live_session);
            }}
          />
        )}
      </div>
    </main>
  );
}
