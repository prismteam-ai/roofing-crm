import CrmDashboard from "@/components/CrmDashboard";
import { loadRoofAgeSnapshot } from "@/lib/loadRoofAgeSnapshot";
import { roofAgeRowsWithDates } from "@/lib/roofAgeProof";
import { lookupSantaClaraParcelAddresses } from "@/lib/santaClaraParcels";

export default async function Home() {
  const snapshot = await loadRoofAgeSnapshot();
  const roofAgeByApn = roofAgeRowsWithDates(snapshot.parcels);
  let parcelAddressByApn: Record<string, string> = {};

  try {
    parcelAddressByApn = await lookupSantaClaraParcelAddresses(
      Object.keys(roofAgeByApn)
    );
  } catch (error) {
    console.error(error);
  }

  return (
    <CrmDashboard
      roofAgeByApn={roofAgeByApn}
      parcelAddressByApn={parcelAddressByApn}
    />
  );
}
