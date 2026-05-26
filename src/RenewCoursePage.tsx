import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { validateRenewalToken, fetchRenewalData, submitRenewalSlip } from "./services/renewal";
import type { RenewalData } from "./services/renewal";

interface PackageOption {
  hours: number;
  price: number;
}

type Step = "packages" | "payment" | "upload" | "done";

export default function RenewCoursePage() {
  const { studentId, courseId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [data, setData] = useState<RenewalData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("packages");
  const [selectedPkg, setSelectedPkg] = useState<PackageOption | null>(null);
  const [uploading, setUploading] = useState(false);
  const [slipFile, setSlipFile] = useState<File | null>(null);

  useEffect(() => {
    if (!token || !studentId || !courseId) {
      setError("Invalid link");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const tokenRow = await validateRenewalToken(token, studentId, courseId);
        const result = await fetchRenewalData(tokenRow, studentId, courseId);
        setData(result);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, studentId, courseId]);

  async function handleSubmitSlip() {
    if (!slipFile || !data || !selectedPkg) return;
    setUploading(true);
    try {
      await submitRenewalSlip({
        schoolId: data.schoolId,
        studentId: data.studentId,
        courseId: data.courseId,
        courseName: data.courseName,
        selectedHours: selectedPkg.hours,
        selectedPrice: selectedPkg.price,
        file: slipFile,
        token: token!,
      });
      setStep("done");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 rounded-full border-4 animate-spin" style={{ borderColor: "#E8E0FF", borderTopColor: "#06C755" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">😔</div>
          <p className="text-gray-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const remaining = data.purchasedHours - data.usedHours;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-sm mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
          <h1 className="text-xl font-bold text-gray-800">{data.studentName}</h1>
          <p className="text-sm text-gray-500 mt-1">{data.courseName}</p>
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full" style={{ backgroundColor: remaining <= 0 ? "#FEE2E2" : "#FEF3C7" }}>
            <span className="text-sm font-medium" style={{ color: remaining <= 0 ? "#DC2626" : "#D97706" }}>
              {remaining <= 0 ? `หมดชั่วโมงแล้ว / Hours used up` : `เหลือ ${remaining} ชม. / ${remaining} hrs left`}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-2">{data.usedHours} / {data.purchasedHours} ชม. / hrs</p>
        </div>

        {/* Step: Packages */}
        {step === "packages" && (
          <div className="space-y-3">
            <h2 className="text-center font-semibold text-gray-700">เลือกแพ็กเกจ / Select Package</h2>
            {data.packages.map((pkg, i) => (
              <button
                key={i}
                onClick={() => { setSelectedPkg(pkg); setStep(data.qrUrl ? "payment" : "upload"); }}
                className="w-full bg-white rounded-2xl shadow p-5 flex items-center justify-between hover:shadow-md transition-shadow active:scale-[0.98]"
              >
                <div>
                  <span className="text-lg font-bold text-gray-800">{pkg.hours} ชม. / {pkg.hours} hrs</span>
                </div>
                <span className="text-xl font-bold" style={{ color: "#06C755" }}>฿{pkg.price.toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step: Payment QR */}
        {step === "payment" && selectedPkg && data.qrUrl && (
          <div className="bg-white rounded-2xl shadow-lg p-6 text-center space-y-4">
            <h2 className="font-semibold text-gray-700">สแกน QR แล้วชำระเงิน / Scan & Pay</h2>
            <div className="text-3xl font-bold" style={{ color: "#06C755" }}>฿{selectedPkg.price.toLocaleString()}</div>
            <img src={data.qrUrl} alt="Payment QR" className="mx-auto w-64 h-64 object-contain rounded-xl" />
            <p className="text-sm text-gray-500">ชำระเงินแล้วกดถัดไป / After payment, tap Next</p>
            <div className="flex gap-3">
              <button onClick={() => setStep("packages")} className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-medium">
                ย้อนกลับ / Back
              </button>
              <button onClick={() => setStep("upload")} className="flex-1 py-3 rounded-xl text-white font-medium" style={{ backgroundColor: "#06C755" }}>
                ถัดไป / Next
              </button>
            </div>
          </div>
        )}

        {/* Step: Upload slip */}
        {step === "upload" && selectedPkg && (
          <div className="bg-white rounded-2xl shadow-lg p-6 text-center space-y-4">
            <h2 className="font-semibold text-gray-700">ส่งสลิปการชำระเงิน / Upload Payment Slip</h2>
            <p className="text-sm text-gray-500">{selectedPkg.hours} ชม. — ฿{selectedPkg.price.toLocaleString()}</p>

            <label className="block w-full py-12 border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer hover:border-green-400 transition-colors">
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setSlipFile(e.target.files?.[0] || null)} />
              {slipFile ? (
                <div className="space-y-2">
                  <img src={URL.createObjectURL(slipFile)} alt="Slip" className="mx-auto w-32 h-32 object-cover rounded-xl" />
                  <p className="text-sm text-green-600 font-medium">{slipFile.name}</p>
                </div>
              ) : (
                <div>
                  <div className="text-4xl mb-2">📸</div>
                  <p className="text-sm text-gray-500">แตะเพื่อถ่ายรูปหรือเลือกไฟล์</p>
                  <p className="text-xs text-gray-400">Tap to take photo or select file</p>
                </div>
              )}
            </label>

            <div className="flex gap-3">
              <button onClick={() => setStep(data.qrUrl ? "payment" : "packages")} className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-medium">
                ย้อนกลับ / Back
              </button>
              <button
                onClick={handleSubmitSlip}
                disabled={!slipFile || uploading}
                className="flex-1 py-3 rounded-xl text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: "#06C755" }}
              >
                {uploading ? "กำลังส่ง..." : "ส่งสลิป / Submit"}
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center space-y-3">
            <div className="text-5xl">✅</div>
            <h2 className="text-xl font-bold text-gray-800">ขอบคุณค่ะ!</h2>
            <p className="text-gray-600">Thank you!</p>
            <p className="text-sm text-gray-500">โรงเรียนจะตรวจสอบการชำระเงินและอนุมัติให้เร็วที่สุด</p>
            <p className="text-xs text-gray-400">The school will verify your payment and approve shortly.</p>
          </div>
        )}
      </div>
    </div>
  );
}
