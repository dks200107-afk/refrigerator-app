// frontend/src/App.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = "https://refrigerator-app-jivi.onrender.com";

function App() {
  const [ingredients, setIngredients] = useState([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('냉장');
  const [expiryDate, setExpiryDate] = useState('');
  const [recipe, setRecipe] = useState('');
  const [shoppingList, setShoppingList] = useState([]);

  // 재료 불러오기
  const fetchIngredients = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/ingredients`);
      setIngredients(res.data);
    } catch (err) {
      console.error("데이터를 가져오는데 실패했습니다.", err);
    }
  };

  useEffect(() => {
    fetchIngredients();
  }, []);

  // 재료 등록
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name || !expiryDate) {
      return alert('내용을 입력하세요.');
    }

    try {
      await axios.post(`${API_BASE_URL}/api/ingredients`, {
        name,
        category,
        expiryDate
      });

      setName('');
      setExpiryDate('');

      fetchIngredients();
    } catch (err) {
      console.error(err);
    }
  };

  // 재료 삭제
  const deleteIngredient = async (id) => {
    const confirmDelete = window.confirm('이 식재료를 삭제하시겠습니까?');

    if (!confirmDelete) return;

    try {
      await axios.delete(`${API_BASE_URL}/api/ingredients/${id}`);
      fetchIngredients();
    } catch (err) {
      console.error(err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  // AI 레시피
  const getAiRecipe = async () => {
    setRecipe('🤖 AI가 냉장고 속 재료를 분석 중입니다...');

    try {
      const res = await axios.get(`${API_BASE_URL}/api/ai-recipe`);
      setRecipe(res.data.recipe);
    } catch (err) {
      setRecipe('레시피를 불러오는 중 오류가 발생했습니다.');
    }
  };

  // 쇼핑 리스트
  const getShoppingList = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/shopping-list`);
      setShoppingList(res.data.shoppingList);
    } catch (err) {
      console.error(err);
    }
  };

  // OCR 업로드
  const handleOcrUpload = async (e) => {
    const file = e.target.files[0];

    if (!file) return;

    const formData = new FormData();
    formData.append('receipt', file);

    try {
      alert('영수증 이미지를 분석합니다! 🧾');

      await axios.post(`${API_BASE_URL}/api/ocr`, formData);

      fetchIngredients();
    } catch (err) {
      console.error(err);
      alert('OCR 처리 중 오류 발생');
    }
  };

  return (
    <div
      style={{
        padding: '20px',
        fontFamily: 'sans-serif',
        maxWidth: '700px',
        margin: '0 auto',
        backgroundColor: '#fff'
      }}
    >
      <h1 style={{ textAlign: 'center', color: '#2c3e50' }}>
        냉장고 관리 프로그램 🧊
      </h1>

      <p
        style={{
          textAlign: 'center',
          color: '#7f8c8d',
          fontSize: '14px'
        }}
      >
        음식물 쓰레기 감소와 효율적인 식재료 관리를 위한 플랫폼
      </p>

      <hr style={{ border: '0.5px solid #eee' }} />

      {/* OCR */}
      <section style={{ marginBottom: '25px' }}>
        <h3>🧾 영수증 스캔 및 자동 등록 (OCR)</h3>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label
            style={{
              padding: '10px 15px',
              background: '#34495e',
              color: '#fff',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            카메라로 촬영하기

            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleOcrUpload}
              style={{ display: 'none' }}
            />
          </label>

          <span style={{ fontSize: '12px', color: '#7f8c8d' }}>
            * 모바일에서 카메라 실행
          </span>
        </div>
      </section>

      {/* 직접 입력 */}
      <section style={{ marginBottom: '25px' }}>
        <h3>✏️ 식재료 직접 입력</h3>

        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap'
          }}
        >
          <input
            type="text"
            placeholder="예: 서울우유 500ml"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ padding: '8px', flex: 1 }}
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ padding: '8px' }}
          >
            <option value="냉장">냉장</option>
            <option value="냉동">냉동</option>
            <option value="실온">실온</option>
          </select>

          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            style={{ padding: '8px' }}
          />

          <button
            type="submit"
            style={{
              padding: '8px 15px',
              background: '#2c3e50',
              color: '#fff',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            등록
          </button>
        </form>
      </section>

      {/* 재고 현황 */}
      <section style={{ marginBottom: '25px' }}>
        <h3>🛒 실시간 냉장고 재고 현황</h3>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '10px'
          }}
        >
          {['냉장', '냉동', '실온'].map((cat) => (
            <div
              key={cat}
              style={{
                width: '33%',
                border: '1px solid #e0e0e0',
                padding: '10px',
                borderRadius: '8px',
                minHeight: '150px'
              }}
            >
              <h4
                style={{
                  margin: '0 0 10px 0',
                  color: '#2980b9',
                  borderBottom: '2px solid #2980b9'
                }}
              >
                {cat}
              </h4>

              {ingredients
                .filter((item) => item.category === cat)
                .map((item) => (
                  <div
                    key={item.id}
                    style={{
                      marginBottom: '8px',
                      padding: '8px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '4px',
                      fontSize: '13px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <strong>{item.name}</strong>

                      <br />

                      <span
                        style={{
                          fontSize: '11px',
                          color: '#e74c3c'
                        }}
                      >
                        ⏳ {item.expiryDate}
                      </span>
                    </div>

                    <button
                      onClick={() => deleteIngredient(item.id)}
                      style={{
                        background: '#e74c3c',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '5px 8px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      삭제
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </section>

      <hr style={{ border: '0.5px solid #eee', margin: '25px 0' }} />

      {/* AI 레시피 */}
      <section style={{ marginBottom: '25px' }}>
        <h3>🤖 AI 맞춤 실시간 레시피 추천</h3>

        <button
          onClick={getAiRecipe}
          style={{
            width: '100%',
            padding: '12px',
            background: '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          오늘 뭐 먹지? 추천 받기
        </button>

        {recipe && (
          <div
            style={{
              padding: '15px',
              background: '#f1f9f5',
              borderLeft: '4px solid #27ae60',
              borderRadius: '4px',
              marginTop: '12px',
              fontSize: '14px',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.6'
            }}
          >
            {recipe}
          </div>
        )}
      </section>

      {/* 쇼핑 리스트 */}
      <section style={{ marginBottom: '25px' }}>
        <h3>📝 스마트 쇼핑 리스트</h3>

        <button
          onClick={getShoppingList}
          style={{
            width: '100%',
            padding: '12px',
            background: '#2980b9',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          부족 재료 예측하기
        </button>

        {shoppingList.length > 0 && (
          <ul
            style={{
              background: '#f4f6f7',
              padding: '15px 15px 15px 35px',
              borderRadius: '4px',
              marginTop: '12px',
              fontSize: '14px'
            }}
          >
            {shoppingList.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '6px' }}>
                {item}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default App;